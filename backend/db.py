"""
Supabase (Postgres) persistence for SANAD.

The app keeps its working state in memory and writes every change through to
Postgres, so a Render restart or redeploy does not lose bookings, sessions or
the audit trails. With no DATABASE_URL set (local dev) every call is a no-op and
the app behaves exactly as an in-memory demo.
"""
import hashlib
import json
import logging
import os

log = logging.getLogger("sanad.db")
_pool = None


def enabled():
    return bool(os.environ.get("DATABASE_URL"))


def _get_pool():
    global _pool
    if _pool is None:
        from psycopg_pool import ConnectionPool
        # prepare_threshold=None: required for Supabase's pgbouncer (transaction mode) pooler
        _pool = ConnectionPool(os.environ["DATABASE_URL"], min_size=1, max_size=5, open=True,
                               kwargs={"prepare_threshold": None, "autocommit": True}, timeout=15)
    return _pool


def execute(sql, params=None):
    """Run a write. Failures are logged, never raised: the in-memory state stays authoritative."""
    if not enabled():
        return
    try:
        with _get_pool().connection() as conn:
            conn.execute(sql, params)
    except Exception:
        log.exception("db write failed")


def executemany(sql, rows):
    if not enabled() or not rows:
        return
    try:
        with _get_pool().connection() as conn, conn.cursor() as cur:
            cur.executemany(sql, rows)
    except Exception:
        log.exception("db batch write failed")


def query(sql, params=None):
    """Run a read; returns a list of dict rows, or None if the database is off/unreachable."""
    if not enabled():
        return None
    try:
        from psycopg.rows import dict_row
        with _get_pool().connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            return cur.fetchall()
    except Exception:
        log.exception("db read failed")
        return None


def J(value):
    from psycopg.types.json import Jsonb
    return Jsonb(value)


# ------------------------------------------------------------------ sessions
def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def save_session(token, role, user_id, ttl_hours):
    execute("insert into sessions (token_hash, role, user_id, expires_at) "
            "values (%s, %s, %s, now() + make_interval(hours => %s)) on conflict do nothing",
            (token_hash(token), role, user_id, ttl_hours))


def load_session(token):
    rows = query("select role, user_id, extract(epoch from expires_at)::float8 as exp from sessions "
                 "where token_hash = %s and expires_at > now()", (token_hash(token),))
    return {"role": rows[0]["role"], "id": rows[0]["user_id"], "exp": rows[0]["exp"]} if rows else None


def drop_session(token):
    execute("delete from sessions where token_hash = %s", (token_hash(token),))


def purge_sessions():
    execute("delete from sessions where expires_at <= now()")


# ------------------------------------------------------------------ programme state
def save_state(invites, appts):
    """Replace invitations + appointments with the in-memory state (used on seed/reset)."""
    if not enabled():
        return
    try:
        with _get_pool().connection() as conn:
            with conn.transaction():
                conn.execute("delete from appointments")
                conn.execute("delete from invitations")
                for i in invites.values():
                    conn.execute("insert into invitations (mrn, sent_at, doctors, status, channels) values (%s,%s,%s,%s,%s)",
                                 (i["mrn"], i["sent_at"], i["doctors"], i["status"], i["channels"]))
                for a in appts.values():
                    conn.execute("insert into appointments (id, mrn, doctor_id, date, time, status, confirmed, booked_at, outcome) "
                                 "values (%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                                 (a["id"], a["mrn"], a["doctor_id"], a["date"], a["time"], a["status"], a["confirmed"],
                                  a["booked_at"], J(a["outcome"]) if a["outcome"] else None))
    except Exception:
        log.exception("db state save failed")


def load_state():
    """Returns (invites, appts) from the database, or None if empty/unavailable."""
    inv = query("select mrn, sent_at::text as sent_at, doctors, status, channels from invitations")
    appts = query("select id, mrn, doctor_id, date::text as date, time, status, confirmed, "
                  "to_char(booked_at, 'YYYY-MM-DD\"T\"HH24:MI:SS') as booked_at, outcome from appointments")
    if inv is None or appts is None or not (inv or appts):
        return None
    return ({r["mrn"]: dict(r) for r in inv}, {r["id"]: dict(r) for r in appts})


def save_invite(i):
    execute("insert into invitations (mrn, sent_at, doctors, status, channels) values (%s,%s,%s,%s,%s) "
            "on conflict (mrn) do update set sent_at = excluded.sent_at, doctors = excluded.doctors, "
            "status = excluded.status, channels = excluded.channels",
            (i["mrn"], i["sent_at"], i["doctors"], i["status"], i["channels"]))


def save_appt(a):
    execute("insert into appointments (id, mrn, doctor_id, date, time, status, confirmed, booked_at, outcome) "
            "values (%s,%s,%s,%s,%s,%s,%s,%s,%s) on conflict (id) do update set status = excluded.status, "
            "confirmed = excluded.confirmed, outcome = excluded.outcome",
            (a["id"], a["mrn"], a["doctor_id"], a["date"], a["time"], a["status"], a["confirmed"],
             a["booked_at"], J(a["outcome"]) if a["outcome"] else None))


def delete_appt(aid):
    execute("delete from appointments where id = %s", (aid,))


# ------------------------------------------------------------------ audit
def log_access(mrn, by):
    execute("insert into access_log (mrn, by_user) values (%s, %s)", (mrn, by))


def log_ai(e):
    execute("insert into ai_audit (user_id, kind, subject, model, request_id, input_tokens, output_tokens, "
            "statements, verified, removed, figures_flagged) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (e["user"], e["kind"], e["subject"], e["model"], e["request_id"], e["input_tokens"], e["output_tokens"],
             e["statements"], e["verified"], e["removed"], e["figures_flagged"]))


def recent_ai(n=50):
    rows = query("select to_char(at, 'YYYY-MM-DD\"T\"HH24:MI:SS') as at, user_id as \"user\", kind, subject, model, request_id, "
                 "input_tokens, output_tokens, statements, verified, removed, figures_flagged "
                 "from ai_audit order by at desc limit %s", (n,))
    return rows or []


# ------------------------------------------------------------------ reference-data seeding
def seed_reference(residents, records, doctors):
    """Upsert the synthetic residents, medical records and doctors (idempotent)."""
    if not enabled():
        raise SystemExit("DATABASE_URL is not set")
    with _get_pool().connection() as conn:
        with conn.transaction():
            for d in doctors:
                conn.execute("insert into doctors (id, name, name_ar, sex, specialty, clinic, langs, cancer) "
                             "values (%s,%s,%s,%s,%s,%s,%s,%s) on conflict (id) do update set name = excluded.name, "
                             "name_ar = excluded.name_ar, specialty = excluded.specialty, clinic = excluded.clinic, "
                             "langs = excluded.langs, cancer = excluded.cancer",
                             (d["id"], d["name"], d["name_ar"], d["sex"], d["specialty"], d["clinic"], d["langs"], d["cancer"]))
            for r in residents:
                conn.execute(
                    "insert into residents (mrn, name, name_ar, sex, age, cancer_type, area, lang, phone, family_history, "
                    "genetic_flag, obesity, diabetes, screening_overdue, evidence, relatives, history) "
                    "values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) on conflict (mrn) do update set "
                    "name = excluded.name, name_ar = excluded.name_ar, age = excluded.age, cancer_type = excluded.cancer_type, "
                    "area = excluded.area, lang = excluded.lang, phone = excluded.phone, family_history = excluded.family_history, "
                    "genetic_flag = excluded.genetic_flag, obesity = excluded.obesity, diabetes = excluded.diabetes, "
                    "screening_overdue = excluded.screening_overdue, evidence = excluded.evidence, "
                    "relatives = excluded.relatives, history = excluded.history",
                    (r["mrn"], r["name"], r["name_ar"], r["sex"], r["age"], r["cancer_type"], r["area"], r["lang"], r["phone"],
                     r["family_history"], r["genetic_flag"], r["obesity"], r["diabetes"], r["screening_overdue"],
                     J(r["evidence"]), J(r["relatives"]), J(r["history"])))
            for mrn, rec in records.items():
                conn.execute("insert into medical_records (mrn, record) values (%s,%s) "
                             "on conflict (mrn) do update set record = excluded.record", (mrn, J(rec)))
