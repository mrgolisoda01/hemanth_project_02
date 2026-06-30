/* ============================================================
 *  store.js — drop-in replacement for localStorage
 *  Reads/writes to Supabase through the Flask backend so the
 *  whole team shares one dataset.
 *
 *  The tracker code calls localStorage.getItem/setItem/removeItem.
 *  We expose a global `store` object with the SAME API, plus a
 *  bootstrap that hydrates everything once before the app starts.
 *
 *  Daily entries are kept in the relational `entries` table; we
 *  mirror them into the same `safc_e4` shape the frontend expects,
 *  so no frontend logic has to change.
 * ============================================================ */
(function () {
  const KV_CACHE = {};        // local mirror of all kv_store keys
  const ENTRIES_KEY = "safc_e4";
  let entriesRowCache = [];   // raw rows from the entries table (with uuid id)

  // ---- low-level fetch helpers ----
  async function apiGet(path) {
    const r = await fetch(path);
    if (!r.ok) throw new Error("GET " + path + " failed");
    return r.json();
  }
  async function apiSend(path, method, body) {
    const r = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) throw new Error(method + " " + path + " failed");
    return r.json().catch(() => ({}));
  }

  // ---- map a relational entry row -> the frontend entry shape ----
  function rowToEntry(row) {
    return {
      id: row.id,                 // uuid (string)
      date: row.entry_date,
      state: row.state,
      city: row.city,
      leads: row.leads || 0,
      eligible: row.eligible || 0,
      mv: row.mv || 0,
      sales: row.sales || 0,
      source: row.source || "Manual",
      by: row.entered_by || "",
      status: row.status || "pending",
      notes: row.notes || "",
    };
  }

  // ---- HYDRATE: pull everything from the server once ----
  async function hydrate() {
    // 1) kv pairs
    try {
      const kv = await apiGet("/api/kv");
      Object.assign(KV_CACHE, kv);
    } catch (e) { console.warn("kv hydrate failed", e); }

    // 2) entries (relational) -> mirror into KV_CACHE[safc_e4]
    try {
      entriesRowCache = await apiGet("/api/entries");
      KV_CACHE[ENTRIES_KEY] = JSON.stringify(entriesRowCache.map(rowToEntry));
    } catch (e) { console.warn("entries hydrate failed", e); }
  }

  // ---- diff the entries array on write and sync to the relational table ----
  // The frontend assigns its own numeric ids; Supabase assigns uuids. We reconcile
  // by a natural key (date|state|city|by) so an Approve/edit updates the right row
  // instead of creating duplicates. After create, we write the uuid back so the
  // in-memory array and the relational table stay in lock-step.
  function natKey(e) {
    return [e.date, e.state, e.city, e.by || ""].join("|");
  }
  async function syncEntries(newArr) {
    const oldRows = entriesRowCache.slice();
    const oldByNat = {};
    oldRows.forEach((r) => { oldByNat[natKey(rowToEntry(r))] = r; });
    const newByNat = {};
    newArr.forEach((e) => { newByNat[natKey(e)] = e; });

    // DELETES: a server row whose natural key is no longer present
    for (const r of oldRows) {
      if (!(natKey(rowToEntry(r)) in newByNat)) {
        try { await apiSend("/api/entries/" + r.id, "DELETE"); } catch (e) {}
      }
    }

    // CREATE or UPDATE each current entry
    for (const e of newArr) {
      const match = oldByNat[natKey(e)];
      if (!match) {
        // brand new -> create, capture uuid back onto the in-memory object
        try {
          const created = await apiSend("/api/entries", "POST", e);
          if (created && created.id) e.id = created.id;
        } catch (err) {}
      } else {
        // existing row -> ensure the in-memory id matches the server uuid
        e.id = match.id;
        const o = rowToEntry(match);
        const changed = ["leads","eligible","mv","sales","source","status","notes"]
          .some((k) => o[k] !== e[k]);
        if (changed) {
          try { await apiSend("/api/entries/" + match.id, "PATCH", e); } catch (err) {}
        }
      }
    }

    // Update our raw cache in place so the NEXT save compares correctly,
    // without yanking the app's in-memory array (which holds the user's latest edit).
    try {
      entriesRowCache = await apiGet("/api/entries");
      KV_CACHE[ENTRIES_KEY] = JSON.stringify(entriesRowCache.map(rowToEntry));
    } catch (e) {}
  }

  // ---- the global `store` object: same API as localStorage ----
  window.store = {
    getItem(key) {
      return key in KV_CACHE ? KV_CACHE[key] : null;
    },
    setItem(key, value) {
      KV_CACHE[key] = value;
      if (key === ENTRIES_KEY) {
        // entries go to the relational table
        let arr = [];
        try { arr = JSON.parse(value) || []; } catch (e) {}
        syncEntries(arr);
      } else {
        // everything else -> kv_store
        apiSend("/api/kv", "POST", { key, value }).catch(() => {});
      }
    },
    removeItem(key) {
      delete KV_CACHE[key];
      apiSend("/api/kv/" + encodeURIComponent(key), "DELETE").catch(() => {});
    },
    clear() {
      Object.keys(KV_CACHE).forEach((k) => this.removeItem(k));
    },
  };

  // ---- bootstrap: hydrate, then start the app ----
  window.__storeReady = hydrate();
})();
