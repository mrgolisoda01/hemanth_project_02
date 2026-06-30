# SAFC / Mr.Golisoda Tracker — Flask + Supabase

Cloud version of the tracker. Flask serves the app and talks to **Supabase**
(Postgres) so the whole team shares one live dataset. The browser never sees
the database key — only the Flask backend does.

---

## File structure

```
safc-supabase/
├── app.py                  # Flask backend (all Supabase REST calls live here)
├── requirements.txt        # Python dependencies
├── render.yaml             # Render.com deploy config
├── supabase_schema.sql     # Run once in Supabase to create the tables
├── .env                    # YOUR secrets (Supabase URL + key) — never commit
├── .env.example            # Template for .env
├── .gitignore
├── templates/
│   └── index.html          # The tracker UI (Flask template)
└── static/
    ├── js/
    │   ├── store.js        # Replaces localStorage -> talks to Flask -> Supabase
    │   └── app.js          # All tracker logic
    └── css/                # (styles are inline in index.html)
```

---

## One-time Supabase setup (5 minutes)

1. Open your Supabase project → **SQL Editor**.
2. Paste the whole contents of `supabase_schema.sql` and click **Run**.
   This creates two tables:
   - `entries`  — one row per daily lead entry (query this in the dashboard)
   - `kv_store` — holds the rest of the config (cities, managers, settings…)
3. Done. The tables are now live.

---

## Run locally in PyCharm

1. **Open the folder** `safc-supabase` in PyCharm.
2. PyCharm will offer to create a virtual environment — accept it
   (or: `python -m venv .venv` then activate it).
3. Install dependencies:
   ```
   pip install -r requirements.txt
   ```
4. The `.env` file already has your Supabase URL and anon key.
5. Run `app.py` (right-click → Run, or the green ▶).
6. Open **http://127.0.0.1:5000** in your browser.

That's it. Any entry you add is saved to Supabase and visible to anyone else
running the app against the same project.

---

## Deploy to Render (so the team gets a URL)

1. Push this folder to a **GitHub** repo (the `.gitignore` keeps `.env` out).
2. On **Render.com** → **New** → **Blueprint** → pick your repo.
   It reads `render.yaml` automatically.
3. In the Render dashboard → your service → **Environment**, add:
   - `SUPABASE_URL`  = `https://ljwhvbtmykreqybehmca.supabase.co/rest/v1/`
   - `SUPABASE_ANON_KEY` = (your anon key)
4. Deploy. Render gives you a public URL to share with the team.

---

## Security notes

- **Never commit `.env`.** It's already in `.gitignore`.
- The anon key is meant to be usable by clients **only when Row Level Security
  (RLS) is on**. The schema enables RLS and adds permissive policies for a
  single shared team. Tighten these later if you add user login.
- Since this key has been shared in chat, consider **rotating it** in
  Supabase → Project Settings → API once you're set up.

---

## How it works (for future you)

- The frontend was written against `localStorage`. Instead of rewriting all of
  it, `store.js` provides a `store` object with the same `getItem/setItem/
  removeItem` API, but it reads/writes through the Flask `/api/*` endpoints.
- On page load, `store.js` **hydrates** all data from Supabase first, then the
  app starts (it waits on `window.__storeReady`).
- Daily entries sync to the relational `entries` table (so you can run real SQL
  queries on them in Supabase). Everything else is stored as JSON in `kv_store`.
- To change what the backend does, edit `app.py`. To change the UI/logic, edit
  `static/js/app.js` or `templates/index.html`.
```
