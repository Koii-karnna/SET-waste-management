# Zero Waste Dashboard — SET PFM

Web app for logging and reporting daily waste data across CMC (อาคาร A/B/C) and NP (NP1/NP2) buildings.
Plain HTML/CSS/JS, no build step. Firebase (Firestore + Auth) for data, GitHub Pages for hosting.

## One-time setup

1. **Firebase config** — open `js/firebase-config.js` and replace the placeholder values with your
   Firebase project's web app config (Firebase console → Project settings → General → Your apps).

2. **Firestore security rules** — open `firestore.rules` in this repo, copy its contents into
   Firebase console → Firestore Database → Rules, and click Publish. This restricts all reads/writes
   to signed-in users.

3. **Create user accounts** — Firebase console → Authentication → Users → Add user. Create one
   account per person who will use the app (email + password).

4. **Import historical data (optional, once)** — after step 1 is done, open `tools/import-seed.html`
   in a browser, sign in with one of the accounts from step 3, and click "เริ่มนำเข้าข้อมูล". This loads
   `data/seed/incoming-2026.json` and `data/seed/outgoing-2026.json` (extracted from the CMC Excel
   files, Jan–Jul 2026) into Firestore. Safe to skip, and safe to delete `tools/import-seed.html`
   afterwards.

5. **Enable GitHub Pages** — repo Settings → Pages → Source: "Deploy from a branch" → Branch: `main`,
   folder `/ (root)`. The site will be published at the URL shown there.

## Data model

- `incomingRecords/{date}_{buildingCode}` — one document per building per day, `items` is a map of
  waste-item id → weight in kg (see `js/data/wasteItems.js` for the 35-item list).
- `outgoingRecords/{autoId}` — one document per shipment line (item, weight, destination, disposal
  method, address, vehicle type).

## Local development

No Node/npm required. `tools/local-server.ps1` is a small static file server for local preview:

```powershell
powershell -File tools/local-server.ps1 -Port 8080
```

Then open `http://localhost:8080/`.
