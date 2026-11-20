"""
SANAD Family Relay — risk-model training script.

IMPORTANT (read before trusting any number this prints):
Abu Dhabi's open datasets only publish AGGREGATE counts (e.g. "118 breast cancer
cases in the 45-49 age band, 2014"), never individual patient records. There is
no real patient-level file to train on. So this script builds a SYNTHETIC
patient-level cohort that reproduces those real aggregate shapes (the same age
distribution, the same obesity-by-age rates) and labels each synthetic person
with a cancer outcome drawn from a hand-written, literature-informed risk
function — not a validated clinical model. A real deployment (per the brief's
"two data layers") would retrain this same pipeline on Malaffi / DoH registry
data under consent, once available. Everything downstream (the API, the
clinician console) says "synthetic training data" for this reason, and the
model is a transparency/engineering demo, never a diagnostic device.
"""
import json
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score, brier_score_loss
from sklearn.calibration import calibration_curve
import joblib
import os
import datetime

rng = np.random.default_rng(42)
N = 9000
OUT_DIR = os.path.join(os.path.dirname(__file__), "models")
os.makedirs(OUT_DIR, exist_ok=True)

AGE_BANDS = [(22,"20-24"),(27,"25-29"),(32,"30-34"),(37,"35-39"),(42,"40-44"),
             (47,"45-49"),(52,"50-54"),(57,"55-59"),(62,"60-64"),(67,"65-69"),
             (72,"70-74"),(77,"75-79"),(82,"80-84"),(87,"85+")]

# real counts from "Age Group Distribution of Breast Cancer Cases...UAE.xlsx" (2014)
BREAST_AGE_WEIGHTS = [1,19,42,94,97,118,89,76,47,20,17,8,4,2]
# real % from "Age-group distribution of colorectal...UAE.xlsx" (2014)
COLORECTAL_AGE_WEIGHTS = [1,3,5,10,7,9,13,14,10,10,7,6,3,2]
# real Abu Dhabi obesity-by-age (2023), midpoints mapped onto the 14 bands
OBESITY_BY_AGE = {  # probability of the "obese" flag, by age
    22:.21,27:.21,32:.29,37:.29,42:.37,47:.37,52:.41,57:.41,62:.41,67:.49,72:.49,77:.49,82:.49,87:.49
}

def sample_ages(weights, n):
    mids = np.array([m for m,_ in AGE_BANDS], dtype=float)
    w = np.array(weights, dtype=float); w = w / w.sum()
    band = rng.choice(len(mids), size=n, p=w)
    jitter = rng.uniform(-2.4, 2.4, size=n)
    return np.clip(mids[band] + jitter, 20, 90)

def build_cohort(cancer_type):
    if cancer_type == "breast":
        age = sample_ages(BREAST_AGE_WEIGHTS, N)
    else:
        age = sample_ages(COLORECTAL_AGE_WEIGHTS, N)

    obesity_p = np.array([OBESITY_BY_AGE[min(AGE_BANDS, key=lambda b: abs(b[0]-a))[0]] for a in age])
    obesity = rng.binomial(1, obesity_p)

    family_history = rng.binomial(1, 0.12, size=N)          # literature-order baseline prevalence
    genetic_flag = rng.binomial(1, 0.02 + 0.5*family_history*0.04)  # BRCA/Lynch more likely if family history
    diabetes = rng.binomial(1, np.clip(0.06 + 0.25*obesity_p + (age>50)*0.08, 0, 0.6))
    # screening overdue: anyone under the guideline start age is "never invited yet"; above it, mostly on time
    start_age = 40 if cancer_type == "breast" else 45
    overdue_p = np.where(age < start_age, 0.97, 0.35)
    screening_overdue = rng.binomial(1, overdue_p)
    nationality = rng.choice(["Citizen", "Expatriate"], size=N, p=[0.2, 0.8])
    sex = rng.choice(["Female", "Male"], size=N, p=[0.55, 0.45]) if cancer_type == "colorectal" else np.array(["Female"]*N)

    age_c = (age - 40) / 10.0
    if cancer_type == "breast":
        logit = (-4.6 + 0.55*age_c + 1.85*family_history + 2.5*genetic_flag
                  + 0.55*obesity + 0.45*screening_overdue + rng.normal(0, 0.35, N))
    else:
        logit = (-4.9 + 0.5*age_c + 1.25*family_history + 2.25*genetic_flag
                  + 0.7*obesity + 0.85*diabetes + 0.4*screening_overdue
                  + 0.15*(sex=="Male") + rng.normal(0, 0.35, N))

    p = 1/(1+np.exp(-logit))
    label = rng.binomial(1, p)

    df = pd.DataFrame({
        "age": age, "family_history": family_history, "genetic_flag": genetic_flag,
        "obesity": obesity, "diabetes": diabetes, "screening_overdue": screening_overdue,
        "nationality": nationality, "sex": sex, "label": label
    })
    return df

FEATURES = {
    "breast": ["age", "family_history", "genetic_flag", "obesity", "screening_overdue"],
    "colorectal": ["age", "family_history", "genetic_flag", "obesity", "diabetes", "screening_overdue"],
}

def train(cancer_type):
    df = build_cohort(cancer_type)
    feats = FEATURES[cancer_type]
    X = df[feats].copy()
    X["age"] = (X["age"] - 40) / 10.0  # same scaling as ground truth, keeps coefficients interpretable
    y = df["label"]

    X_train, X_test, y_train, y_test, df_train, df_test = train_test_split(
        X, y, df, test_size=0.25, random_state=7, stratify=y
    )
    model = LogisticRegression(max_iter=1000)
    model.fit(X_train, y_train)

    probs_test = model.predict_proba(X_test)[:, 1]
    auc = roc_auc_score(y_test, probs_test)
    brier = brier_score_loss(y_test, probs_test)
    frac_pos, mean_pred = calibration_curve(y_test, probs_test, n_bins=8, strategy="quantile")

    # subgroup fairness slice (AUC + positive rate by nationality and sex, on test set)
    fairness = []
    for col in ["nationality", "sex"]:
        for grp, idx in df_test.groupby(col).groups.items():
            n = len(idx)
            if n < 15:
                continue
            yt = y_test.loc[idx]
            pt = pd.Series(probs_test, index=y_test.index).loc[idx]
            try:
                grp_auc = roc_auc_score(yt, pt) if yt.nunique() > 1 else None
            except Exception:
                grp_auc = None
            fairness.append({
                "dimension": col, "group": str(grp), "n": int(n),
                "positive_rate": round(float(yt.mean()), 4),
                "flagged_rate": round(float((pt > 0.12).mean()), 4),
                "auc": round(float(grp_auc), 3) if grp_auc is not None else None,
            })

    coefs = dict(zip(feats, model.coef_[0].tolist()))
    meta = {
        "cancer_type": cancer_type,
        "algorithm": "Logistic Regression (scikit-learn)",
        "features": feats,
        "coefficients": coefs,
        "intercept": float(model.intercept_[0]),
        "training_rows": int(len(X_train)),
        "test_rows": int(len(X_test)),
        "test_auc": round(float(auc), 3),
        "test_brier_score": round(float(brier), 4),
        "calibration_curve": {
            "mean_predicted": [round(float(v), 4) for v in mean_pred],
            "fraction_positive": [round(float(v), 4) for v in frac_pos],
        },
        "fairness_slices": fairness,
        "positive_rate_train": round(float(y_train.mean()), 4),
        "trained_at": datetime.datetime.utcnow().isoformat() + "Z",
        "training_data": "SYNTHETIC cohort generated from real UAE/Abu Dhabi aggregate age and obesity "
                          "distributions (MOHAP Cancer Registry 2014, MOHAP Obesity Prevalence 2017-2023). "
                          "No individual patient records were used.",
        "limitations": [
            "Ground-truth labels come from a hand-written risk function, not real diagnoses.",
            "Not clinically validated. Never use to diagnose, triage, or deny care.",
            "Ranks population screening priority only; the clinician makes every decision.",
        ],
    }

    joblib.dump(model, os.path.join(OUT_DIR, f"{cancer_type}_model.joblib"))
    with open(os.path.join(OUT_DIR, f"{cancer_type}_meta.json"), "w") as f:
        json.dump(meta, f, indent=2)
    print(f"[{cancer_type}] AUC={auc:.3f} Brier={brier:.4f} n_train={len(X_train)} n_test={len(X_test)}")
    return meta

if __name__ == "__main__":
    for ct in ["breast", "colorectal"]:
        train(ct)
    print("Saved models + metadata to", OUT_DIR)
