"""
SANAD Family Relay — screening programme backend.

Three portals share one live state. The frontend tells the API which portal it is
with an `X-Portal` header (doh | app | doctor); the role is enforced by the session.
  /doh      DoH / ADPHC programme console   (role: doh)
  /app      Resident mobile app              (role: resident)
  /doctor   Doctor web portal                (role: doctor)

Flow: DoH invites a flagged resident -> resident picks a doctor and a slot ->
doctor sees the referral with the clinical picture and records the outcome ->
DoH and the resident see the result.

Local:      python app.py                       (http://localhost:5055/doh, /app, /doctor)
Production: gunicorn app:app  (one worker; see render.yaml). State persists to
            Supabase when DATABASE_URL is set.
"""
import datetime
import hashlib
import json
import logging
import os
import random
import secrets
import threading
import time
from functools import wraps

import warnings

import joblib
import numpy as np

warnings.filterwarnings("ignore", message="X does not have valid feature names")
from flask import Flask, abort, g, jsonify, request, send_from_directory

import ai
import db

BASE = os.path.dirname(os.path.abspath(__file__))
ai.load_env(os.path.join(BASE, ".env"))
ai.AUDIT_SINK = lambda e: db.log_ai(e)
STATIC = os.path.join(BASE, "static")
MODELS_DIR = os.path.join(BASE, "models")
logging.basicConfig(level=logging.INFO)

app = Flask(__name__, static_folder=STATIC, static_url_path="/static")
LOCK = threading.RLock()

PORTAL_ROLE = {"doh": "doh", "app": "resident", "doctor": "doctor"}
# Demo PINs. Override with env vars for any public deployment.
DEMO_PINS = {"doh": os.environ.get("DEMO_PIN_DOH", "2026"),
             "resident": os.environ.get("DEMO_PIN_RESIDENT", "1111"),
             "doctor": os.environ.get("DEMO_PIN_DOCTOR", "2222")}
STAFF_ID = "ADPHC-0142"
SESSION_HOURS = 12


def portal():
    p = request.headers.get("X-Portal", "")
    if not p:  # direct page loads: /doh, /app, /doctor
        p = request.path.strip("/").split("/")[0]
    return p if p in PORTAL_ROLE else None


def client_ip():
    # Render / Vercel put the real client first in X-Forwarded-For
    return (request.headers.get("X-Forwarded-For", "").split(",")[0].strip() or request.remote_addr or "?")


_HITS = {}


def rate_limited(bucket, limit, window):
    """Tiny in-memory sliding-window limiter. Returns True if the caller is over the limit."""
    now = time.time()
    with LOCK:
        hits = [t for t in _HITS.get(bucket, []) if now - t < window]
        over = len(hits) >= limit
        if not over:
            hits.append(now)
        _HITS[bucket] = hits
        if len(_HITS) > 5000:  # keep the table bounded
            for k in [k for k, v in _HITS.items() if not v or now - v[-1] > window]:
                _HITS.pop(k, None)
    return over


def today():
    return datetime.date.today()


def now_iso():
    return datetime.datetime.now().isoformat(timespec="minutes")


# ------------------------------------------------------------------ model
_MODELS = {}


def load(cancer_type):
    if cancer_type not in _MODELS:
        model = joblib.load(os.path.join(MODELS_DIR, f"{cancer_type}_model.joblib"))
        with open(os.path.join(MODELS_DIR, f"{cancer_type}_meta.json")) as f:
            _MODELS[cancer_type] = (model, json.load(f))
    return _MODELS[cancer_type]


TIERS = ((0.15, "critical"), (0.06, "watch"), (0.0, "routine"))


def tier_of(p):
    return next(name for cut, name in TIERS if p >= cut)


# ------------------------------------------------------------------ synthetic residents
def ev(key, params, source, date=None, verified=True):
    return {"key": key, "params": params, "source": source, "date": date, "verified": verified}


RESIDENTS = [
    dict(mrn="SA-20519", name="Fatima Al Zaabi", name_ar="فاطمة الزعابي", sex="F", age=46, cancer_type="breast",
         area="khalidiya", lang="ar", phone="+971 50 ••• 4419",
         family_history=True, genetic_flag=True, obesity=False, diabetes=False, screening_overdue=False,
         evidence={"genetic_flag": ev("genetic", {"variant": "BRCA2"}, "genome", "2025-11-04"),
                   "family_history": ev("family", {"relation": "mother", "age": 44}, "visit", "2026-02-18"),
                   "age": ev("age", {"age": 46}, "record")},
         relatives=[{"rel": "mother", "affected": True, "age": 44}, {"rel": "aunt", "affected": True, "age": 51},
                    {"rel": "sister", "affected": False}, {"rel": "daughter", "affected": False}],
         history=[{"test": "mammogram", "date": "2024-01-15", "result": "normal"},
                  {"test": "mammogram", "date": "2026-01-20", "result": "normal"}]),
    dict(mrn="SA-20481", name="Mariam Al Nuaimi", name_ar="مريم النعيمي", sex="F", age=38, cancer_type="breast",
         area="khalifa_city", lang="ar", phone="+971 50 ••• 7312",
         family_history=True, genetic_flag=False, obesity=False, diabetes=False, screening_overdue=True,
         evidence={"family_history": ev("family", {"relation": "mother", "age": 44}, "visit", "2026-09-03", verified=False),
                   "screening_overdue": ev("overdueNever", {"test": "mammogram"}, "registry"),
                   "age": ev("age", {"age": 38}, "record")},
         relatives=[{"rel": "mother", "affected": True, "age": 44}, {"rel": "sister", "affected": False},
                    {"rel": "daughter", "affected": False}],
         history=[]),
    dict(mrn="SA-20502", name="Rajesh Kumar", name_ar="راجيش كومار", sex="M", age=50, cancer_type="colorectal",
         area="mussafah", lang="en", phone="+971 55 ••• 2087",
         family_history=False, genetic_flag=False, obesity=True, diabetes=True, screening_overdue=True,
         evidence={"diabetes": ev("hba1c", {"value": 7.9}, "malaffi_lab", "2026-11-10"),
                   "obesity": ev("bmi", {"bmi": 32.8}, "malaffi_vitals", "2026-10-02"),
                   "screening_overdue": ev("overdueNever", {"test": "fit"}, "registry"),
                   "age": ev("age", {"age": 50}, "record")},
         relatives=[{"rel": "father", "affected": False}, {"rel": "brother", "affected": False}],
         history=[]),
    dict(mrn="SA-20574", name="Khalid Al Shamsi", name_ar="خالد الشامسي", sex="M", age=61, cancer_type="colorectal",
         area="al_ain", lang="ar", phone="+971 50 ••• 6650",
         family_history=False, genetic_flag=True, obesity=False, diabetes=True, screening_overdue=False,
         evidence={"genetic_flag": ev("genetic", {"variant": "MLH1 (Lynch)"}, "genome", "2025-06-21"),
                   "diabetes": ev("hba1c", {"value": 8.2}, "malaffi_lab", "2026-08-30"),
                   "age": ev("age", {"age": 61}, "record")},
         relatives=[{"rel": "father", "affected": False}, {"rel": "son", "affected": False}],
         history=[{"test": "colonoscopy", "date": "2025-08-14", "result": "clear"}]),
    dict(mrn="SA-20533", name="Omar Haddad", name_ar="عمر حداد", sex="M", age=57, cancer_type="colorectal",
         area="bateen", lang="ar", phone="+971 56 ••• 9013",
         family_history=True, genetic_flag=False, obesity=True, diabetes=False, screening_overdue=False,
         evidence={"family_history": ev("family", {"relation": "father", "age": 62}, "visit", "2026-04-11"),
                   "obesity": ev("bmi", {"bmi": 31.2}, "malaffi_vitals", "2026-07-19"),
                   "age": ev("age", {"age": 57}, "record")},
         relatives=[{"rel": "father", "affected": True, "age": 62}, {"rel": "brother", "affected": False},
                    {"rel": "son", "affected": False}],
         history=[{"test": "fit", "date": "2026-03-10", "result": "negative"}]),
    dict(mrn="SA-20547", name="Aisha Al Mansoori", name_ar="عائشة المنصوري", sex="F", age=52, cancer_type="breast",
         area="reem", lang="ar", phone="+971 52 ••• 3398",
         family_history=False, genetic_flag=False, obesity=True, diabetes=False, screening_overdue=True,
         evidence={"screening_overdue": ev("overdueMonths", {"test": "mammogram", "months": 30}, "registry"),
                   "obesity": ev("bmi", {"bmi": 34.1}, "malaffi_vitals", "2026-06-05"),
                   "age": ev("age", {"age": 52}, "record")},
         relatives=[{"rel": "mother", "affected": False}, {"rel": "daughter", "affected": False}],
         history=[{"test": "mammogram", "date": "2024-05-08", "result": "normal"}]),
    dict(mrn="SA-20560", name="Priya Nair", name_ar="بريا ناير", sex="F", age=44, cancer_type="colorectal",
         area="nahyan", lang="en", phone="+971 54 ••• 1176",
         family_history=False, genetic_flag=False, obesity=False, diabetes=False, screening_overdue=True,
         evidence={"screening_overdue": ev("overdueNever", {"test": "fit"}, "registry"),
                   "age": ev("age", {"age": 44}, "record")},
         relatives=[], history=[]),
    dict(mrn="SA-20588", name="Noura Al Ketbi", name_ar="نورة الكتبي", sex="F", age=33, cancer_type="breast",
         area="shamkha", lang="ar", phone="+971 50 ••• 8824",
         family_history=False, genetic_flag=False, obesity=False, diabetes=False, screening_overdue=True,
         evidence={"screening_overdue": ev("overdueNever", {"test": "mammogram"}, "registry"),
                   "age": ev("age", {"age": 33}, "record")},
         relatives=[], history=[]),
]
BY_MRN = {r["mrn"]: r for r in RESIDENTS}
FAMILY_INVITE = ["mother", "aunt", "sister", "daughter"]

# ------------------------------------------------------------------ full medical records (doctor-only, synthetic)
# Everything a treating doctor would pull from the health information exchange:
# all conditions (not only cancer-related), medications, allergies, lab trends and
# the visit timeline. Shaped to be consistent with each resident's risk profile.
ICD = {"t2dm": "E11.9", "prediabetes": "R73.03", "obesity": "E66.9", "htn": "I10", "dyslipidemia": "E78.5",
       "hypothyroid": "E03.9", "asthma": "J45.909", "vitd": "E55.9", "ida": "D50.9", "gerd": "K21.9",
       "migraine": "G43.909", "pcos": "E28.2", "lbp": "M54.5", "gestational_dm": "O24.4", "covid": "U07.1",
       "appendicitis": "K35.80", "kidney_stone": "N20.0", "fatty_liver": "K76.0", "osteoarthritis": "M17.9",
       "sleep_apnea": "G47.33", "colon_polyp": "K63.5"}
LAB_META = {"hba1c": {"unit": "%", "hi": 5.7}, "ldl": {"unit": "mmol/L", "hi": 3.0}, "bp": {"unit": "mmHg", "hi": 130},
            "bmi": {"unit": "kg/m²", "hi": 25}, "vitd": {"unit": "ng/mL", "lo": 30}, "hb": {"unit": "g/dL", "lo": 12},
            "tsh": {"unit": "mIU/L", "hi": 4.0, "lo": 0.4}, "egfr": {"unit": "mL/min", "lo": 90}}


def cond(key, since, status, until=None):
    return {"key": key, "icd": ICD[key], "since": since, "until": until, "status": status}


def med(name, dose, freq, for_, since):
    return {"name": name, "dose": dose, "freq": freq, "for": for_, "since": since}


def enc(date, type_, ref):
    return {"date": date, "type": type_, "ref": ref}


RECORDS = {
    "SA-20519": {
        "conditions": [cond("hypothyroid", "2016-03", "managed"), cond("gerd", "2019-09", "active"),
                       cond("migraine", "2012-05", "managed"), cond("vitd", "2021-02", "resolved", "2024-01")],
        "medications": [med("Levothyroxine", "75 mcg", "daily", "hypothyroid", "2016-03"),
                        med("Omeprazole", "20 mg", "daily", "gerd", "2019-09"),
                        med("Sumatriptan", "50 mg", "asNeeded", "migraine", "2012-05")],
        "allergies": [{"key": "penicillin", "reaction": "hives"}],
        "labs": {"tsh": [["2023-02", 3.9], ["2024-02", 2.8], ["2025-03", 2.4], ["2026-03", 2.1]],
                 "vitd": [["2021-02", 14], ["2022-06", 22], ["2024-01", 34], ["2026-03", 38]],
                 "bmi": [["2023-02", 24.1], ["2024-02", 24.6], ["2025-03", 24.3], ["2026-03", 24.0]]},
        "events": [enc("2026-03-11", "specialist", "hypothyroid"), enc("2025-10-14", "vaccination", "flu"),
                   enc("2025-07-02", "gp", "gerd"), enc("2019-05-20", "er", "migraine"), enc("2008-04-03", "surgery", "csection")],
    },
    "SA-20481": {
        "conditions": [cond("pcos", "2014-08", "managed"), cond("asthma", "2001-01", "managed"),
                       cond("ida", "2022-03", "resolved", "2023-05"), cond("gestational_dm", "2017-02", "resolved", "2017-07")],
        "medications": [med("Metformin", "500 mg", "twice", "pcos", "2014-08"),
                        med("Salbutamol inhaler", "100 mcg", "asNeeded", "asthma", "2001-01")],
        "allergies": [{"key": "nsaids", "reaction": "wheeze"}],
        "labs": {"hb": [["2022-03", 10.8], ["2023-05", 12.4], ["2025-04", 12.9]],
                 "hba1c": [["2017-03", 5.6], ["2021-09", 5.4], ["2025-04", 5.5]],
                 "bmi": [["2021-09", 26.8], ["2023-05", 26.1], ["2025-04", 25.4]]},
        "events": [enc("2025-11-02", "vaccination", "flu"), enc("2022-03-15", "gp", "ida"),
                   enc("2021-04-08", "vaccination", "covid"), enc("2021-02-21", "er", "asthma"), enc("2017-06-12", "surgery", "csection")],
    },
    "SA-20502": {
        "conditions": [cond("t2dm", "2026-11", "active"), cond("obesity", "2019-04", "active"), cond("htn", "2020-06", "active"),
                       cond("dyslipidemia", "2021-01", "active"), cond("fatty_liver", "2023-05", "active"),
                       cond("sleep_apnea", "2024-09", "active"), cond("lbp", "2018-08", "resolved", "2018-11")],
        "medications": [med("Metformin", "500 mg", "twice", "t2dm", "2026-11"), med("Amlodipine", "5 mg", "daily", "htn", "2020-06"),
                        med("Atorvastatin", "20 mg", "nightly", "dyslipidemia", "2021-01")],
        "allergies": [{"key": "sulfa", "reaction": "rash"}],
        "labs": {"hba1c": [["2023-05", 5.9], ["2024-05", 6.3], ["2025-05", 6.4], ["2026-11", 7.9]],
                 "bp": [["2023-05", 138], ["2024-05", 142], ["2025-05", 136], ["2026-11", 134]],
                 "ldl": [["2023-05", 4.1], ["2024-05", 3.6], ["2025-05", 3.2], ["2026-11", 3.0]],
                 "bmi": [["2023-05", 31.0], ["2024-05", 31.9], ["2025-05", 32.4], ["2026-10", 32.8]]},
        "events": [enc("2026-11-10", "gp", "t2dm"), enc("2025-10-20", "vaccination", "flu"), enc("2024-09-03", "specialist", "sleep_apnea"),
                   enc("2023-05-16", "gp", "fatty_liver"), enc("2018-08-07", "er", "lbp")],
    },
    "SA-20574": {
        "conditions": [cond("t2dm", "2014-02", "active"), cond("htn", "2012-07", "managed"), cond("dyslipidemia", "2015-03", "managed"),
                       cond("osteoarthritis", "2020-10", "active"), cond("colon_polyp", "2025-08", "resolved", "2025-08"),
                       cond("kidney_stone", "2017-03", "resolved", "2017-04")],
        "medications": [med("Metformin", "1000 mg", "twice", "t2dm", "2014-02"), med("Empagliflozin", "10 mg", "daily", "t2dm", "2023-01"),
                        med("Losartan", "50 mg", "daily", "htn", "2012-07"), med("Rosuvastatin", "10 mg", "nightly", "dyslipidemia", "2015-03")],
        "allergies": [{"key": "contrast", "reaction": "hives"}],
        "labs": {"hba1c": [["2023-08", 7.4], ["2024-08", 7.9], ["2025-08", 8.0], ["2026-08", 8.2]],
                 "egfr": [["2023-08", 88], ["2024-08", 84], ["2025-08", 80], ["2026-08", 76]],
                 "bp": [["2023-08", 134], ["2024-08", 138], ["2025-08", 132], ["2026-08", 136]],
                 "ldl": [["2023-08", 2.9], ["2024-08", 2.6], ["2025-08", 2.4], ["2026-08", 2.3]]},
        "events": [enc("2026-08-30", "specialist", "t2dm"), enc("2025-10-11", "vaccination", "flu"), enc("2025-08-14", "surgery", "polypectomy"),
                   enc("2021-11-22", "surgery", "knee_arthroscopy"), enc("2017-03-05", "er", "kidney_stone")],
    },
    "SA-20533": {
        "conditions": [cond("obesity", "2015-01", "active"), cond("htn", "2018-04", "managed"), cond("gerd", "2020-02", "managed"),
                       cond("sleep_apnea", "2022-06", "active"), cond("covid", "2022-01", "resolved", "2022-01"),
                       cond("appendicitis", "2004-09", "resolved", "2004-09")],
        "medications": [med("Lisinopril", "10 mg", "daily", "htn", "2018-04"), med("Pantoprazole", "40 mg", "daily", "gerd", "2020-02")],
        "allergies": [],
        "labs": {"bp": [["2023-04", 146], ["2024-04", 138], ["2025-04", 132], ["2026-04", 128]],
                 "bmi": [["2023-04", 33.0], ["2024-04", 32.2], ["2025-04", 31.6], ["2026-07", 31.2]],
                 "ldl": [["2023-04", 3.4], ["2024-04", 3.2], ["2025-04", 3.1], ["2026-04", 3.0]]},
        "events": [enc("2026-03-10", "screening", "fit"), enc("2025-10-05", "vaccination", "flu"), enc("2022-06-14", "specialist", "sleep_apnea"),
                   enc("2022-01-09", "admission", "covid"), enc("2004-09-18", "surgery", "appendectomy")],
    },
    "SA-20547": {
        "conditions": [cond("obesity", "2016-05", "active"), cond("prediabetes", "2023-06", "active"), cond("htn", "2021-03", "managed"),
                       cond("hypothyroid", "2019-11", "managed"), cond("osteoarthritis", "2022-02", "active")],
        "medications": [med("Amlodipine", "5 mg", "daily", "htn", "2021-03"), med("Levothyroxine", "50 mcg", "daily", "hypothyroid", "2019-11"),
                        med("Paracetamol", "1 g", "asNeeded", "osteoarthritis", "2022-02")],
        "allergies": [{"key": "latex", "reaction": "rash"}],
        "labs": {"hba1c": [["2023-06", 5.8], ["2024-06", 6.0], ["2025-06", 6.1], ["2026-06", 6.2]],
                 "bmi": [["2023-06", 33.2], ["2024-06", 33.8], ["2025-06", 34.0], ["2026-06", 34.1]],
                 "tsh": [["2019-11", 5.6], ["2022-06", 3.1], ["2024-06", 2.7], ["2026-06", 2.5]]},
        "events": [enc("2026-06-05", "gp", "prediabetes"), enc("2025-10-18", "vaccination", "flu"), enc("2024-05-08", "screening", "mammogram"),
                   enc("2022-02-23", "specialist", "osteoarthritis")],
    },
    "SA-20560": {
        "conditions": [cond("migraine", "2010-04", "managed"), cond("vitd", "2024-02", "active"),
                       cond("ida", "2019-07", "resolved", "2020-03"), cond("lbp", "2021-05", "resolved", "2021-08")],
        "medications": [med("Vitamin D3", "50,000 IU", "weekly", "vitd", "2024-02"), med("Rizatriptan", "10 mg", "asNeeded", "migraine", "2010-04")],
        "allergies": [{"key": "shellfish", "reaction": "swelling"}],
        "labs": {"vitd": [["2024-02", 16], ["2025-02", 22], ["2026-02", 27]], "hb": [["2019-07", 11.2], ["2020-03", 12.6], ["2025-02", 13.0]]},
        "events": [enc("2026-02-12", "gp", "vitd"), enc("2025-10-27", "vaccination", "flu"), enc("2021-05-19", "gp", "lbp")],
    },
    "SA-20588": {
        "conditions": [cond("asthma", "2000-01", "managed"), cond("vitd", "2023-01", "resolved", "2023-09"),
                       cond("covid", "2021-08", "resolved", "2021-08")],
        "medications": [med("Budesonide/formoterol inhaler", "160/4.5 mcg", "twice", "asthma", "2018-03")],
        "allergies": [],
        "labs": {"vitd": [["2023-01", 18], ["2023-09", 32]], "bmi": [["2023-01", 22.4], ["2025-09", 22.1]]},
        "events": [enc("2025-09-14", "vaccination", "flu"), enc("2021-08-02", "gp", "covid"), enc("2020-12-10", "er", "asthma")],
    },
}


def medical_record(mrn):
    r = RECORDS[mrn]
    labs = []
    for key, series in r["labs"].items():
        meta = LAB_META[key]
        last = series[-1][1]
        flag = "high" if "hi" in meta and last >= meta["hi"] else "low" if "lo" in meta and last < meta["lo"] else "normal"
        labs.append({"key": key, "unit": meta["unit"], "hi": meta.get("hi"), "lo": meta.get("lo"), "series": series, "flag": flag})
    return {**r, "labs": labs, "events": sorted(r["events"], key=lambda e: e["date"], reverse=True), "source": "malaffi"}


# ------------------------------------------------------------------ fictional doctors
DOCTORS = [
    dict(id="D01", name="Dr. Shaikha Al Suwaidi", name_ar="د. شيخة السويدي", sex="F", specialty="breast_radiology",
         clinic="khalifa_women", langs=["ar", "en"], cancer="breast"),
    dict(id="D02", name="Dr. Hessa Al Mazrouei", name_ar="د. حصة المزروعي", sex="F", specialty="womens_health",
         clinic="khalidiya_women", langs=["ar", "en"], cancer="breast"),
    dict(id="D03", name="Dr. Sarah Thomas", name_ar="د. سارة توماس", sex="F", specialty="breast_imaging",
         clinic="mussafah_family", langs=["en", "ml", "hi"], cancer="breast"),
    dict(id="D04", name="Dr. Ahmed Al Hammadi", name_ar="د. أحمد الحمادي", sex="M", specialty="gastro",
         clinic="bateen_digestive", langs=["ar", "en"], cancer="colorectal"),
    dict(id="D05", name="Dr. Rahul Menon", name_ar="د. راهول مينون", sex="M", specialty="family_med",
         clinic="mussafah_family", langs=["en", "ml", "hi"], cancer="colorectal"),
    dict(id="D06", name="Dr. Layla Haddad", name_ar="د. ليلى حداد", sex="F", specialty="gastro",
         clinic="alain_digestive", langs=["ar", "en", "fr"], cancer="colorectal"),
]
DOC_BY_ID = {d["id"]: d for d in DOCTORS}
CLINIC_AREA = {"khalifa_women": "khalifa_city", "khalidiya_women": "khalidiya", "mussafah_family": "mussafah",
               "bateen_digestive": "bateen", "alain_digestive": "al_ain"}

# ------------------------------------------------------------------ scoring
SCREEN_INTERVAL_MONTHS = {"mammogram": 24, "fit": 12, "colonoscopy": 24}
REASON_CATEGORY = {"genetic_flag": "genetic", "family_history": "family", "obesity": "obesity",
                   "diabetes": "diabetes", "screening_overdue": "overdue"}
PREP = {"breast_mammogram": ["caffeine", "clothing", "deodorant", "id", "early"],
        "breast_highrisk": ["reports", "clothing", "metal", "id", "early"],
        "crc_fit": ["meds", "kit", "id", "early"],
        "crc_colonoscopy": ["meds", "reports", "id", "early"]}
DURATION = {"breast_mammogram": 30, "breast_highrisk": 60, "crc_fit": 20, "crc_colonoscopy": 30}
RECALL_YEARS = {"breast_mammogram": 2, "breast_highrisk": 1, "crc_fit": 1, "crc_colonoscopy": 2}


def months_since(iso):
    d = datetime.date.fromisoformat(iso)
    t = today()
    return (t.year - d.year) * 12 + (t.month - d.month) - (1 if t.day < d.day else 0)


def score(p):
    model, meta = load(p["cancer_type"])
    feats = meta["features"]
    row = [((p["age"] - 40) / 10.0) if f == "age" else int(bool(p.get(f))) for f in feats]
    prob = float(model.predict_proba(np.array([row]))[0, 1])
    return prob, {f: meta["coefficients"][f] * row[i] for i, f in enumerate(feats)}


def factors(p, contrib):
    active = [f for f, c in contrib.items() if c > 0 and f in p["evidence"]]
    total = sum(contrib[f] for f in active) or 1.0
    out = []
    for f in sorted(active, key=lambda f: -contrib[f]):
        share = contrib[f] / total
        level = "high" if share >= 0.4 else "medium" if share >= 0.15 else "low"
        out.append({"feature": f, "share": round(share * 100), "level": level, **p["evidence"][f]})
    return out


def suggestion(p, tier):
    if p["cancer_type"] == "breast":
        if p["genetic_flag"]:
            return "mammogram_mri_counsel"
        if tier == "critical":
            return "mammogram_counsel" if p["family_history"] else "mammogram_soon"
        return "mammogram_soon" if tier == "watch" else "routine_breast"
    if p["genetic_flag"]:
        return "colonoscopy"
    if tier == "critical":
        return "fit_fast"
    return "fit" if tier == "watch" else "routine_crc"


def visit_type(p, sug):
    if p["cancer_type"] == "breast":
        return "breast_highrisk" if sug == "mammogram_mri_counsel" else "breast_mammogram"
    return "crc_colonoscopy" if sug == "colonoscopy" else "crc_fit"


def assess(p):
    prob, contrib = score(p)
    t = tier_of(prob)
    sug = suggestion(p, t)
    facs = factors(p, contrib)
    return {"risk": round(prob, 4), "tier": t, "suggestion": sug, "visit_type": visit_type(p, sug), "factors": facs}


def public_resident(p):
    return {k: p[k] for k in ("mrn", "name", "name_ar", "sex", "age", "area", "lang", "cancer_type")}


def clinical_detail(p):
    a = assess(p)
    facts = [f for f in a["factors"] if f["feature"] != "age"]
    verified = sum(1 for f in facts if f["verified"])
    ratio = verified / len(facts) if facts else 1.0
    last = max(p["history"], key=lambda h: h["date"]) if p["history"] else None
    last_months = months_since(last["date"]) if last else None
    overdue = last_months is None or last_months > SCREEN_INTERVAL_MONTHS.get(last["test"], 24)
    return {**public_resident(p), **a,
            "confidence": {"level": "high" if ratio == 1 else "medium" if ratio >= 0.5 else "low",
                           "verified": verified, "total": len(facts)},
            "relatives": p["relatives"], "history": sorted(p["history"], key=lambda h: h["date"]),
            "last_screened_months": last_months, "overdue": overdue}


# ------------------------------------------------------------------ scheduling
TIMES = ["09:00", "10:30", "12:00", "14:00", "15:30"]


def workdays(n, forward=True, start=None):
    d, out = (start or today()), []
    step = datetime.timedelta(days=1 if forward else -1)
    while len(out) < n:
        d += step
        if d.weekday() not in (5, 6):  # UAE weekend: Saturday, Sunday
            out.append(d)
    return out


def slots_for(doc_id, n=10):
    taken = {(a["date"], a["time"]) for a in APPTS.values() if a["doctor_id"] == doc_id}
    out = []
    for d in workdays(n):
        rng = random.Random(f"{doc_id}{d.isoformat()}")
        times = [t for t in TIMES if rng.random() > 0.35 and (d.isoformat(), t) not in taken]
        out.append({"date": d.isoformat(), "times": times})
    return out


def doc_public(d, resident=None):
    nxt = next((s for s in slots_for(d["id"]) if s["times"]), None)
    out = {k: d[k] for k in ("id", "name", "name_ar", "sex", "specialty", "clinic", "langs")}
    out["area"] = CLINIC_AREA[d["clinic"]]
    out["next"] = {"date": nxt["date"], "time": nxt["times"][0]} if nxt else None
    if resident:
        out["lang_match"] = resident["lang"] in d["langs"]
        out["near"] = CLINIC_AREA[d["clinic"]] == resident["area"]
    return out


def matched_doctors(p):
    docs = [doc_public(d, p) for d in DOCTORS if d["cancer"] == p["cancer_type"]]
    docs.sort(key=lambda d: (not d["lang_match"], not d["near"], d["next"]["date"] if d["next"] else "9999"))
    return docs


# ------------------------------------------------------------------ live state
INVITES, APPTS, SEQ = {}, {}, [1003]


def latest_appt(mrn):
    items = [a for a in APPTS.values() if a["mrn"] == mrn]
    return max(items, key=lambda a: a["booked_at"]) if items else None


def seed():
    with LOCK:
        INVITES.clear()
        APPTS.clear()
        SEQ[0] = 1003
        t = today()
        nxt, prev = workdays(5), workdays(8, forward=False)

        def invite(mrn, days_ago, docs, status):
            INVITES[mrn] = {"mrn": mrn, "sent_at": (t - datetime.timedelta(days=days_ago)).isoformat(),
                            "doctors": docs, "status": status, "channels": ["app", "sms"]}

        invite("SA-20533", 21, ["D04", "D06", "D05"], "completed")
        APPTS["A1000"] = {"id": "A1000", "mrn": "SA-20533", "doctor_id": "D04", "date": prev[5].isoformat(),
                          "time": "12:00", "status": "completed", "confirmed": True,
                          "booked_at": (t - datetime.timedelta(days=18)).isoformat() + "T10:00",
                          "outcome": {"result": "normal", "notes": "FIT negative. Routine recall.",
                                      "at": prev[5].isoformat() + "T12:40"}}
        invite("SA-20574", 9, ["D04", "D06", "D05"], "booked")
        APPTS["A1001"] = {"id": "A1001", "mrn": "SA-20574", "doctor_id": "D04", "date": nxt[1].isoformat(),
                          "time": "10:30", "status": "booked", "confirmed": True, "outcome": None,
                          "booked_at": (t - datetime.timedelta(days=7)).isoformat() + "T09:12"}
        invite("SA-20547", 5, ["D01", "D02", "D03"], "booked")
        APPTS["A1002"] = {"id": "A1002", "mrn": "SA-20547", "doctor_id": "D01", "date": nxt[0].isoformat(),
                          "time": "14:00", "status": "booked", "confirmed": False, "outcome": None,
                          "booked_at": (t - datetime.timedelta(days=3)).isoformat() + "T18:40"}
        db.save_state(INVITES, APPTS)


def restore_or_seed():
    """Start from what Supabase holds; seed the demo data only when it is empty."""
    state = db.load_state()
    if state:
        with LOCK:
            INVITES.clear(); INVITES.update(state[0])
            APPTS.clear(); APPTS.update(state[1])
            SEQ[0] = max([1003] + [int(a[1:]) + 1 for a in APPTS if a[1:].isdigit()])
        logging.info("restored %d invitations, %d appointments from the database", len(INVITES), len(APPTS))
    else:
        seed()
    ai.AI_AUDIT.extend(reversed(db.recent_ai()))


def pipeline_status(p, tier):
    a = latest_appt(p["mrn"])
    if a:
        return a["status"]
    inv = INVITES.get(p["mrn"])
    if inv:
        return inv["status"]
    return "routine" if tier == "routine" else "flagged"


# ------------------------------------------------------------------ auth
SESSIONS = {}  # token -> {role, id}; mirrored in the database so restarts keep users signed in


def bearer():
    auth = request.headers.get("Authorization", "")
    return auth[7:] if auth.startswith("Bearer ") else ""


def get_session(token):
    if not token:
        return None
    sess = SESSIONS.get(token) or db.load_session(token)
    if sess and sess["exp"] < time.time():
        SESSIONS.pop(token, None)
        return None
    if sess:
        SESSIONS[token] = sess
    return sess


def role_required(role):
    def deco(fn):
        @wraps(fn)
        def inner(*args, **kwargs):
            sess = get_session(bearer())
            if not sess or sess["role"] != role or PORTAL_ROLE.get(portal()) != role:
                return jsonify({"error": "forbidden"}), 403
            g.user = sess["id"]
            return fn(*args, **kwargs)
        return inner
    return deco


@app.get("/")
def index():
    return jsonify({"service": "sanad-api", "portals": ["/doh", "/app", "/doctor"], "health": "/healthz"})


@app.get("/healthz")
def healthz():
    return jsonify({"ok": True, "db": db.enabled(), "ai": bool(os.environ.get("ANTHROPIC_API_KEY"))})


@app.get("/doh")
@app.get("/app")
@app.get("/doctor")
def portal_page():
    return send_from_directory(os.path.join(STATIC, request.path.strip("/")), "index.html")


@app.get("/api/demo/accounts")
def demo_accounts():
    p = portal()
    if p == "app":
        return jsonify([{"id": r["mrn"], "name": r["name"], "name_ar": r["name_ar"], "phone": r["phone"],
                         "pending": INVITES.get(r["mrn"], {}).get("status") == "notified"} for r in RESIDENTS])
    if p == "doctor":
        return jsonify([{"id": d["id"], "name": d["name"], "name_ar": d["name_ar"], "specialty": d["specialty"],
                         "upcoming": sum(1 for a in APPTS.values() if a["doctor_id"] == d["id"] and a["status"] == "booked")}
                        for d in DOCTORS])
    return jsonify([{"id": STAFF_ID}])


@app.post("/api/login")
def login():
    role = PORTAL_ROLE.get(portal())
    body = request.get_json(silent=True) or {}
    uid, pin = body.get("id"), str(body.get("pin", ""))
    if role == "doh":
        uid = STAFF_ID
    elif (role == "resident" and uid not in BY_MRN) or (role == "doctor" and uid not in DOC_BY_ID):
        return jsonify({"error": "unknown account"}), 400
    if not role:
        return jsonify({"error": "invalid"}), 401
    if rate_limited(f"login:{client_ip()}", 10, 300):  # 10 attempts / 5 min / IP
        return jsonify({"error": "too many attempts"}), 429
    if not secrets.compare_digest(pin.encode(), DEMO_PINS[role].encode()):
        return jsonify({"error": "invalid"}), 401
    token = secrets.token_urlsafe(24)
    SESSIONS[token] = {"role": role, "id": uid, "exp": time.time() + SESSION_HOURS * 3600}
    db.save_session(token, role, uid, SESSION_HOURS)
    return jsonify({"token": token, "id": uid})


@app.post("/api/logout")
def logout():
    token = bearer()
    SESSIONS.pop(token, None)
    if token:
        db.drop_session(token)
    return jsonify({"ok": True})


# ------------------------------------------------------------------ DoH / ADPHC
def doh_row(p):
    a = assess(p)
    appt = latest_appt(p["mrn"])
    inv = INVITES.get(p["mrn"])
    doc = DOC_BY_ID.get(appt["doctor_id"]) if appt else None
    return {**public_resident(p), "risk": a["risk"], "tier": a["tier"], "visit_type": a["visit_type"],
            "reasons": [REASON_CATEGORY[f["feature"]] for f in a["factors"] if f["feature"] != "age"],
            "status": pipeline_status(p, a["tier"]),
            "invite": {"sent_at": inv["sent_at"], "doctors": inv["doctors"], "status": inv["status"]} if inv else None,
            "appointment": {"date": appt["date"], "time": appt["time"], "booked_at": appt["booked_at"],
                            "doctor": {"name": doc["name"], "name_ar": doc["name_ar"]},
                            "outcome": appt["outcome"]["result"] if appt["outcome"] else None,
                            "outcome_at": appt["outcome"]["at"] if appt["outcome"] else None} if appt else None}


def population_tiers(cancer_type, n=4000):
    model, meta = load(cancer_type)
    feats = meta["features"]
    rng = np.random.default_rng(123)
    age = rng.uniform(25, 80, n)
    base = {"family_history": 0.12, "genetic_flag": 0.02, "obesity": 0.35, "diabetes": 0.15, "screening_overdue": 0.45}
    cols = [(age - 40) / 10.0 if f == "age" else rng.binomial(1, base[f], n) for f in feats]
    tiers = [tier_of(x) for x in model.predict_proba(np.column_stack(cols))[:, 1]]
    return {k: round(tiers.count(k) / n * 100, 1) for k in ("critical", "watch", "routine")}


@app.get("/api/doh/residents")
@role_required("doh")
def doh_residents():
    with LOCK:
        rows = [doh_row(p) for p in RESIDENTS]
    rows.sort(key=lambda r: -r["risk"])
    return jsonify(rows)


@app.get("/api/doh/overview")
@role_required("doh")
def doh_overview():
    return jsonify(overview_data())


def overview_data():
    with LOCK:
        rows = [doh_row(p) for p in RESIDENTS]
    st = [r["status"] for r in rows]
    tiers = {k: sum(1 for r in rows if r["tier"] == k) for k in ("critical", "watch", "routine")}
    early, late = 206 + 939, 772 + 811  # UAE Cancer Registry SEER stage, 2014 (unknown excluded)
    return ({
        "kpi": {"flagged": st.count("flagged"),
                "invited": st.count("notified") + st.count("snoozed"),
                "booked": st.count("booked"), "seen": st.count("completed"),
                "declined": st.count("declined")},
        "funnel": {"flagged": sum(1 for r in rows if r["tier"] != "routine" or r["invite"]),
                   "invited": sum(1 for r in rows if r["invite"]),
                   "booked": st.count("booked") + st.count("completed"), "seen": st.count("completed")},
        "tiers": tiers, "residents": len(rows),
        "population": {"breast": population_tiers("breast"), "colorectal": population_tiers("colorectal")},
        "stage": {"early_pct": round(early / (early + late) * 100), "target": 50},
        "cases_by_site": [["Breast", 325], ["Thyroid", 199], ["Colorectal", 175], ["Leukemia / blood", 128],
                          ["Lung", 84], ["Lymph nodes", 82]],
        "obesity_by_age": [["18-29", 28.5], ["30-44", 37.1], ["45-59", 40.7], ["60+", 49.0]],
    })


ACCESS_LOG = []  # every clinical-detail view by programme staff, for audit


@app.get("/api/doh/resident/<mrn>")
@role_required("doh")
def doh_resident(mrn):
    p = BY_MRN.get(mrn) or abort(404)
    with LOCK:
        detail = clinical_detail(p)
        entry = {"mrn": mrn, "by": g.user, "at": now_iso()}
        ACCESS_LOG.append(entry)
        db.log_access(mrn, g.user)
    return jsonify({**detail, "accessed_at": entry["at"]})


@app.get("/api/doh/match/<mrn>")
@role_required("doh")
def doh_match(mrn):
    p = BY_MRN.get(mrn) or abort(404)
    with LOCK:
        return jsonify({"visit_type": assess(p)["visit_type"], "doctors": matched_doctors(p)})


@app.post("/api/doh/invite")
@role_required("doh")
def doh_invite():
    body = request.get_json(silent=True) or {}
    p = BY_MRN.get(body.get("mrn"))
    if not p:
        return jsonify({"error": "unknown resident"}), 400
    eligible = {d["id"] for d in DOCTORS if d["cancer"] == p["cancer_type"]}
    docs = [d for d in body.get("doctors", []) if d in eligible]
    channels = [c for c in body.get("channels", []) if c in ("app", "sms")] or ["app"]
    if not docs:
        return jsonify({"error": "choose at least one doctor"}), 400
    with LOCK:
        a = latest_appt(p["mrn"])
        if a and a["status"] == "booked":
            return jsonify({"error": "already booked"}), 409
        INVITES[p["mrn"]] = {"mrn": p["mrn"], "sent_at": today().isoformat(), "doctors": docs,
                             "status": "notified", "channels": channels}
        if a:  # a fresh invite starts a new cycle
            del APPTS[a["id"]]
            db.delete_appt(a["id"])
        db.save_invite(INVITES[p["mrn"]])
    return jsonify({"ok": True})


@app.post("/api/doh/reset")
@role_required("doh")
def doh_reset():
    seed()
    return jsonify({"ok": True})


# ------------------------------------------------------------------ resident app (no clinical detail)
@app.get("/api/me")
@role_required("resident")
def me():
    p = BY_MRN[g.user]
    with LOCK:
        a = assess(p)
        inv = INVITES.get(p["mrn"])
        appt = latest_appt(p["mrn"])
        vt = a["visit_type"]
        out = {"name": p["name"], "name_ar": p["name_ar"], "lang": p["lang"], "visit_type": vt,
               "duration": DURATION[vt], "prep": PREP[vt], "relatives": FAMILY_INVITE,
               "invitation": {"status": inv["status"], "sent_at": inv["sent_at"]} if inv else None,
               "appointment": None}
        if appt:
            d = DOC_BY_ID[appt["doctor_id"]]
            out["appointment"] = {"id": appt["id"], "date": appt["date"], "time": appt["time"],
                                  "status": appt["status"], "confirmed": appt["confirmed"],
                                  "doctor": doc_public(d),
                                  "outcome": {"result": appt["outcome"]["result"], "at": appt["outcome"]["at"],
                                              "recall_years": RECALL_YEARS[vt]} if appt["outcome"] else None}
    return jsonify(out)


@app.get("/api/me/doctors")
@role_required("resident")
def me_doctors():
    p = BY_MRN[g.user]
    inv = INVITES.get(p["mrn"])
    if not inv:
        return jsonify([])
    with LOCK:
        docs = [d for d in matched_doctors(p) if d["id"] in inv["doctors"]]
    return jsonify(docs)


@app.get("/api/me/slots/<doc_id>")
@role_required("resident")
def me_slots(doc_id):
    inv = INVITES.get(g.user)
    if not inv or doc_id not in inv["doctors"]:
        return jsonify({"error": "not offered"}), 403
    with LOCK:
        return jsonify({"doctor": doc_public(DOC_BY_ID[doc_id], BY_MRN[g.user]), "days": slots_for(doc_id)})


@app.post("/api/me/book")
@role_required("resident")
def me_book():
    body = request.get_json(silent=True) or {}
    doc_id, date, tm = body.get("doctor"), body.get("date"), body.get("time")
    with LOCK:
        inv = INVITES.get(g.user)
        if not inv or doc_id not in inv["doctors"]:
            return jsonify({"error": "not offered"}), 403
        day = next((s for s in slots_for(doc_id) if s["date"] == date), None)
        if not day or tm not in day["times"]:
            return jsonify({"error": "slot unavailable"}), 409
        old = latest_appt(g.user)
        if old and old["status"] == "booked":
            del APPTS[old["id"]]
            db.delete_appt(old["id"])
        aid = f"A{SEQ[0]}"
        SEQ[0] += 1
        APPTS[aid] = {"id": aid, "mrn": g.user, "doctor_id": doc_id, "date": date, "time": tm,
                      "status": "booked", "confirmed": False, "outcome": None,
                      "booked_at": datetime.datetime.now().isoformat(timespec="seconds")}
        inv["status"] = "booked"
        db.save_appt(APPTS[aid])
        db.save_invite(inv)
    return jsonify({"id": aid})


@app.post("/api/me/respond")
@role_required("resident")
def me_respond():
    action = (request.get_json(silent=True) or {}).get("action")
    status = {"snooze": "snoozed", "decline": "declined"}.get(action)
    with LOCK:
        inv = INVITES.get(g.user)
        if not inv or not status or inv["status"] not in ("notified", "snoozed", "declined"):
            return jsonify({"error": "invalid"}), 400
        inv["status"] = status
        db.save_invite(inv)
    return jsonify({"status": status})


@app.post("/api/me/confirm")
@role_required("resident")
def me_confirm():
    with LOCK:
        a = latest_appt(g.user)
        if not a or a["status"] != "booked":
            return jsonify({"error": "no booking"}), 400
        a["confirmed"] = True
        db.save_appt(a)
    return jsonify({"ok": True})


@app.post("/api/me/family")
@role_required("resident")
def me_family():
    rels = (request.get_json(silent=True) or {}).get("relatives", [])
    return jsonify({"sent": len([r for r in rels if r in FAMILY_INVITE])})


# ------------------------------------------------------------------ doctor portal
def appt_summary(a):
    p = BY_MRN[a["mrn"]]
    s = assess(p)
    top = next((f for f in s["factors"] if f["feature"] != "age"), None)
    return {"id": a["id"], "date": a["date"], "time": a["time"], "status": a["status"], "confirmed": a["confirmed"],
            "booked_at": a["booked_at"], "visit_type": s["visit_type"], "outcome": a["outcome"],
            "patient": {**public_resident(p), "risk": s["risk"], "tier": s["tier"], "top": top}}


@app.get("/api/doctor/me")
@role_required("doctor")
def doctor_me():
    return jsonify(doc_public(DOC_BY_ID[g.user]))


@app.get("/api/doctor/appointments")
@role_required("doctor")
def doctor_appointments():
    with LOCK:
        rows = [appt_summary(a) for a in APPTS.values() if a["doctor_id"] == g.user]
    rows.sort(key=lambda r: (r["date"], r["time"]))
    return jsonify(rows)


@app.get("/api/doctor/appointment/<aid>")
@role_required("doctor")
def doctor_appointment(aid):
    with LOCK:
        a = APPTS.get(aid)
        if not a or a["doctor_id"] != g.user:
            return jsonify({"error": "not found"}), 404
        p = BY_MRN[a["mrn"]]
        inv = INVITES.get(a["mrn"])
        return jsonify({**appt_summary(a), "invited_at": inv["sent_at"] if inv else None,
                        "duration": DURATION[assess(p)["visit_type"]], "clinical": clinical_detail(p),
                        "record": medical_record(p["mrn"])})


@app.post("/api/doctor/appointment/<aid>/complete")
@role_required("doctor")
def doctor_complete(aid):
    body = request.get_json(silent=True) or {}
    result = body.get("result")
    notes = str(body.get("notes", ""))[:600]
    if result not in ("normal", "followup", "referred"):
        return jsonify({"error": "invalid result"}), 400
    with LOCK:
        a = APPTS.get(aid)
        if not a or a["doctor_id"] != g.user or a["status"] != "booked":
            return jsonify({"error": "not found"}), 404
        a["status"] = "completed"
        a["outcome"] = {"result": result, "notes": notes, "at": now_iso()}
        db.save_appt(a)
        if a["mrn"] in INVITES:
            INVITES[a["mrn"]]["status"] = "completed"
            db.save_invite(INVITES[a["mrn"]])
    return jsonify({"ok": True})


# ------------------------------------------------------------------ SANAD Assist (generative AI, grounded)
CORS_ORIGINS = {o.strip().rstrip("/") for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()}


@app.after_request
def cors(resp):
    """The Vercel frontends call this API cross-origin. Bearer tokens, no cookies, so an allow-list is enough."""
    origin = request.headers.get("Origin", "")
    if origin and ("*" in CORS_ORIGINS or origin in CORS_ORIGINS):
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type, X-Portal"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        resp.headers["Access-Control-Max-Age"] = "600"
        resp.headers["Vary"] = "Origin"
    return resp


AI_CALLS_PER_HOUR =int(os.environ.get("AI_CALLS_PER_HOUR", "30"))


@app.before_request
def limit_ai_spend():
    """Each Claude call costs money, so cap them per signed-in user."""
    if request.method == "POST" and "/ai/" in request.path:
        who = hashlib.sha256(bearer().encode()).hexdigest()[:16] if bearer() else client_ip()
        if rate_limited(f"ai:{who}", AI_CALLS_PER_HOUR, 3600):
            return jsonify({"error": "ai", "code": "rate"}), 429


AI_STATUS = {"auth": 503, "unavailable": 503, "rate": 429, "network": 503, "api": 502, "refusal": 422,
             "truncated": 502, "format": 502}


def _ai_body():
    body = request.get_json(silent=True) or {}
    lang = body.get("lang") if body.get("lang") in ("en", "ar") else "en"
    return body, lang


def _ai_question(body):
    q = str(body.get("question", "")).strip()
    return q if 3 <= len(q) <= 500 else None


def _ai_fail(e):
    return jsonify({"error": "ai", "code": e.code}), AI_STATUS.get(e.code, 502)


def _doctor_evidence(aid):
    with LOCK:
        a = APPTS.get(aid)
        if not a or a["doctor_id"] != g.user:
            return None
        p = BY_MRN[a["mrn"]]
        return ai.doctor_evidence(a, DURATION[assess(p)["visit_type"]], clinical_detail(p), medical_record(p["mrn"]))


@app.post("/api/doctor/appointment/<aid>/ai/brief")
@role_required("doctor")
def doctor_ai_brief(aid):
    body, lang = _ai_body()
    ev = _doctor_evidence(aid)
    if ev is None:
        return jsonify({"error": "not found"}), 404
    try:
        return jsonify(ai.generate("brief", ev, lang, user=g.user, subject=aid,
                                   cache_key=f"brief:{aid}", refresh=bool(body.get("refresh"))))
    except ai.AIError as e:
        return _ai_fail(e)


@app.post("/api/doctor/appointment/<aid>/ai/ask")
@role_required("doctor")
def doctor_ai_ask(aid):
    body, lang = _ai_body()
    q = _ai_question(body)
    if not q:
        return jsonify({"error": "question must be 3-500 characters"}), 400
    ev = _doctor_evidence(aid)
    if ev is None:
        return jsonify({"error": "not found"}), 404
    try:
        return jsonify(ai.generate("ask_doctor", ev, lang, user=g.user, subject=aid, question=q))
    except ai.AIError as e:
        return _ai_fail(e)


@app.post("/api/doh/resident/<mrn>/ai/explain")
@role_required("doh")
def doh_ai_explain(mrn):
    body, lang = _ai_body()
    p = BY_MRN.get(mrn) or abort(404)
    with LOCK:
        row = doh_row(p)
        ev = ai.doh_resident_evidence(row, clinical_detail(p), matched_doctors(p))
    try:
        return jsonify(ai.generate("explain", ev, lang, user=g.user, subject=mrn,
                                   cache_key=f"explain:{mrn}:{row['status']}", refresh=bool(body.get("refresh"))))
    except ai.AIError as e:
        return _ai_fail(e)


@app.post("/api/doh/ai/ask")
@role_required("doh")
def doh_ai_ask():
    body, lang = _ai_body()
    q = _ai_question(body)
    if not q:
        return jsonify({"error": "question must be 3-500 characters"}), 400
    ov = overview_data()
    with LOCK:
        rows = sorted((doh_row(p) for p in RESIDENTS), key=lambda r: -r["risk"])
        confidence = {}
        for p in RESIDENTS:
            c = clinical_detail(p)
            confidence[p["mrn"]] = {**c["confidence"], "unverified": [
                ai.REASON_FEATURE[f["feature"]] for f in c["factors"] if f["feature"] != "age" and not f["verified"]]}
    ev = ai.doh_programme_evidence(rows, ov, confidence)
    try:
        return jsonify(ai.generate("ask_programme", ev, lang, user=g.user, subject="programme", question=q))
    except ai.AIError as e:
        return _ai_fail(e)


@app.get("/api/doh/ai/audit")
@role_required("doh")
def doh_ai_audit():
    return jsonify(ai.AI_AUDIT[-50:][::-1])


# ------------------------------------------------------------------ serve
def bootstrap():
    for ct in ("breast", "colorectal"):
        load(ct)
    db.purge_sessions()
    restore_or_seed()


# Runs on import so `gunicorn app:app` is ready to serve (use ONE worker: state is cached in memory).
bootstrap()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5055))
    for name in PORTAL_ROLE:
        print(f"  {name:7s} -> http://localhost:{port}/{name}", flush=True)
    app.run(host="127.0.0.1", port=port, threaded=True)
