"""
Load the synthetic reference data (residents, medical records, doctors) into Supabase.
Idempotent — safe to re-run. Run the SQL migration first.

    DATABASE_URL=postgresql://... python seed_db.py
"""
import app  # importing app bootstraps it; reference data lives in app.py
import db

db.seed_reference(app.RESIDENTS, app.RECORDS, app.DOCTORS)
print(f"seeded {len(app.DOCTORS)} doctors, {len(app.RESIDENTS)} residents, {len(app.RECORDS)} medical records")
