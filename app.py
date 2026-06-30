"""
SAFC / Mr.Golisoda Tracker — Flask backend
===========================================
This server is the ONLY thing that talks to Supabase. The browser never sees
the anon key. All persistence goes through the REST endpoints defined below.

Two Supabase tables are used (see supabase_schema.sql):
  1. entries   — proper relational table: one row per daily lead entry.
                 Query it directly in the Supabase dashboard.
  2. kv_store  — key/value table holding the structured config the tracker uses
                 (targeted cities, managers, settings, bottles, HR, etc.) as JSON.

Run locally (PyCharm):  python app.py   ->  http://127.0.0.1:5000
Run on Render:          gunicorn app:app
"""

import os
import requests
from flask import Flask, jsonify, request, render_template
from dotenv import load_dotenv

load_dotenv()  # read .env

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")  # .../rest/v1
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")

if not SUPABASE_URL or not SUPABASE_ANON_KEY:
    print("WARNING: SUPABASE_URL or SUPABASE_ANON_KEY missing. Check your .env file.")

# Headers sent on every Supabase REST call
SB_HEADERS = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
    "Content-Type": "application/json",
}

app = Flask(__name__)


# ----------------------------------------------------------------------
#  Helpers
# ----------------------------------------------------------------------
def sb(path):
    """Build a full Supabase REST URL for a table/path."""
    return f"{SUPABASE_URL}/{path}"


# ======================================================================
#  PAGE
# ======================================================================
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/favicon.ico")
def favicon():
    return ("", 204)


# ======================================================================
#  KV STORE  (config, managers, settings, bottles, HR, modules, etc.)
#  The frontend "store" shim maps localStorage -> these endpoints.
# ======================================================================
@app.route("/api/kv", methods=["GET"])
def kv_get_all():
    """Return every key/value pair as a flat object: { key: value_string }."""
    try:
        r = requests.get(sb("kv_store?select=k,v"), headers=SB_HEADERS, timeout=20)
        r.raise_for_status()
        rows = r.json()
        return jsonify({row["k"]: row["v"] for row in rows})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/kv", methods=["POST"])
def kv_set():
    """Upsert one key. Body: { "key": "...", "value": "..." }."""
    data = request.get_json(force=True)
    key, value = data.get("key"), data.get("value")
    if key is None:
        return jsonify({"error": "key required"}), 400
    try:
        # upsert via Prefer: resolution=merge-duplicates (k is primary key)
        headers = dict(SB_HEADERS)
        headers["Prefer"] = "resolution=merge-duplicates,return=minimal"
        r = requests.post(
            sb("kv_store"),
            headers=headers,
            json=[{"k": key, "v": value}],
            timeout=20,
        )
        r.raise_for_status()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/kv/<key>", methods=["DELETE"])
def kv_delete(key):
    try:
        r = requests.delete(sb(f"kv_store?k=eq.{key}"), headers=SB_HEADERS, timeout=20)
        r.raise_for_status()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ======================================================================
#  ENTRIES  (proper relational table — query in Supabase dashboard)
#  Columns: id (uuid, default), entry_date, state, city, leads, eligible,
#           mv, sales, source, entered_by, status, notes, created_at
# ======================================================================
@app.route("/api/entries", methods=["GET"])
def entries_list():
    try:
        r = requests.get(
            sb("entries?select=*&order=entry_date.desc"),
            headers=SB_HEADERS,
            timeout=20,
        )
        r.raise_for_status()
        return jsonify(r.json())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/entries", methods=["POST"])
def entries_create():
    data = request.get_json(force=True)
    row = {
        "entry_date": data.get("date"),
        "state": data.get("state"),
        "city": data.get("city"),
        "leads": data.get("leads", 0),
        "eligible": data.get("eligible", 0),
        "mv": data.get("mv", 0),
        "sales": data.get("sales", 0),
        "source": data.get("source", "Manual"),
        "entered_by": data.get("by", ""),
        "status": data.get("status", "pending"),
        "notes": data.get("notes", ""),
    }
    try:
        headers = dict(SB_HEADERS)
        headers["Prefer"] = "return=representation"
        r = requests.post(sb("entries"), headers=headers, json=[row], timeout=20)
        r.raise_for_status()
        return jsonify(r.json()[0] if r.json() else {})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/entries/<entry_id>", methods=["PATCH"])
def entries_update(entry_id):
    data = request.get_json(force=True)
    allowed = {"entry_date", "state", "city", "leads", "eligible",
               "mv", "sales", "source", "entered_by", "status", "notes"}
    # map frontend keys -> column names
    keymap = {"date": "entry_date", "by": "entered_by"}
    row = {}
    for k, v in data.items():
        col = keymap.get(k, k)
        if col in allowed:
            row[col] = v
    try:
        headers = dict(SB_HEADERS)
        headers["Prefer"] = "return=minimal"
        r = requests.patch(
            sb(f"entries?id=eq.{entry_id}"), headers=headers, json=row, timeout=20
        )
        r.raise_for_status()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/entries/<entry_id>", methods=["DELETE"])
def entries_delete(entry_id):
    try:
        r = requests.delete(
            sb(f"entries?id=eq.{entry_id}"), headers=SB_HEADERS, timeout=20
        )
        r.raise_for_status()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ======================================================================
#  Health check
# ======================================================================
@app.route("/api/health")
def health():
    ok = bool(SUPABASE_URL and SUPABASE_ANON_KEY)
    return jsonify({"ok": ok, "supabase_configured": ok})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
