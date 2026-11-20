# Deploying SANAD: Frontend (Vercel), then Database (Supabase), then Backend (Render)

```
Browser ──> Vercel (static portals: /doh /app /doctor)
   └─ fetch + Bearer token ──> Render (Flask API) ──> Supabase Postgres
                                      └──> Anthropic API
```
The frontend and backend each need the other's URL, so you visit Vercel twice: once to get the URL, once to set the API address (step 3f).

## Step 0 — Put the code on GitHub (once)
Nothing is deleted. `.gitignore` already excludes `backend/.env`, `backend/.venv/` and `__pycache__`.
```
cd "d:\sammit\Version 1"
git init
git add .
git status          # check: no .env, no .venv in the list
git commit -m "SANAD"
```
Create an empty repo on github.com, then:
```
git remote add origin https://github.com/<you>/<repo>.git
git branch -M main
git push -u origin main
```

## Step 1 — Frontend on Vercel
1. vercel.com → **Add New → Project** → import the GitHub repo.
2. **Root Directory:** `backend/static`  ·  **Framework Preset:** Other  ·  Build command: leave empty  ·  Output directory: leave empty.
3. **Deploy.** Note the URL, e.g. `https://sanad-xyz.vercel.app`.
4. Open `/doh`, `/app` and `/doctor` on it. The pages load, but login fails until the backend exists (expected).

## Step 2 — Database on Supabase
1. supabase.com → **New project**. Save the database password.
2. **SQL Editor → New query** → paste the whole of `supabase/migrations/0001_init.sql` → **Run**.
   Check **Table Editor**: 8 tables, each marked "RLS enabled".
3. **Connect → Session pooler** (or Project Settings → Database → Connection string). Copy the URI and replace `[YOUR-PASSWORD]`. This is your `DATABASE_URL`.
   Use the **pooler** string, not "Direct connection": direct is IPv6-only and Render can't reach it.
4. Load the demo data. In PowerShell, using a new venv so your existing `.venv` is untouched:
   ```
   cd "d:\sammit\Version 1\backend"
   py -m venv .venv-win
   .venv-win\Scripts\activate
   pip install -r requirements.txt
   $env:DATABASE_URL = "postgresql://...your pooler string..."
   python seed_db.py
   ```
   Expect: `seeded 6 doctors, 8 residents, 8 medical records`. In Table Editor, `residents` now has 8 rows.
   (`.venv-win` is git-ignored too, since the ignore rule matches any `.venv*` folder.)

## Step 3 — Backend on Render
1. render.com → **New → Blueprint** → connect the repo. It reads `render.yaml` and proposes a web service `sanad-api`.
2. Enter the environment variables:

   | Variable | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | the key from your local `backend/.env` |
   | `DATABASE_URL` | Supabase pooler string from step 2.3 |
   | `CORS_ORIGINS` | your Vercel URL from step 1.3, no trailing slash |
   | `DEMO_PIN_DOH`, `DEMO_PIN_RESIDENT`, `DEMO_PIN_DOCTOR` | new PINs of your choice (defaults are public in the code) |

3. **Apply / Deploy.** Wait for "Live". Note the URL, e.g. `https://sanad-api.onrender.com`.
4. Open `<render-url>/healthz`. Expect `{"ai":true,"db":true,"ok":true}`.
   `db:false` → `DATABASE_URL` missing or wrong. `ai:false` → `ANTHROPIC_API_KEY` missing.

### 3f — Point the frontend at the backend
1. Edit `backend/static/shared/config.js`:
   ```js
   window.SANAD_API = 'https://sanad-api.onrender.com';
   ```
   (your real Render URL, no trailing slash)
2. ```
   git add backend/static/shared/config.js
   git commit -m "Set API URL"
   git push
   ```
   Vercel redeploys automatically.

## Step 4 — Test
Open `https://<vercel-url>/doh`, sign in with your DoH PIN, invite a resident, then sign in at `/app` as that resident and book. Refresh the Supabase **appointments** table to see the row. The first request after idle takes ~30 s (Render free tier wakes up).

## Troubleshooting
- Login shows a network error → `CORS_ORIGINS` doesn't exactly match the Vercel URL, or `config.js` still has an empty URL.
- `db write failed` in the Render logs → wrong `DATABASE_URL`, or the SQL in step 2.2 wasn't run.
- AI panels return an error → check the Render logs; `ai.py` calls `claude-opus-5-5` with a beta flag.

## Before sharing the link
Everything is synthetic demo data with demo-style PINs. Don't put real patient data in it. Each AI call costs money; `AI_CALLS_PER_HOUR` (default 30 per user) limits it.
