## Imported Claude Cowork project instructions

Develop a website to manage the Pet Dental Clinic Workflow. Using the clinic's forms (in `reference/forms/`), build a web app that makes the workflow for each patient visit easier. It will mostly be used on an iPad, so it should look best there, but it must also work in a desktop browser.

## Project notes

- Single-file app: everything is in `index.html` (inline CSS/JS, no framework, no build). Keep it that way, and make sure it still works when opened straight from disk.
- iPad first (Safari, usually added to the Home Screen). Keep touch targets ≥ 44px, inputs at ≥ 16px font (smaller makes Safari zoom in), and use hover styles only inside `@media (hover:hover)`.
- Workflow steps (`STEPS`): checkin, auth, exam, anes, dental, discharge. Each maps to a form in `reference/forms/`. `missing()` defines what each step needs before it counts as complete.
- Data: localStorage keys `pdc-data-v1` (data, with `sync.rev`), `pdc-sync-v1` (GitHub settings and `baseRev`), `pdc-token-v1` (token). Never merge these keys and never export the token. Increase `rev` only when the stored data actually changes.
- No patient data in this repo. `.gitignore` blocks `*.json`, spreadsheets and `reference/`. The example patients (Biscuit, Miso) are generated in code and flagged `sample: true`.
- Medication labels live in the discharge step (`v.discharge.rx`). Label settings are `data.settings.labels`; the formulary is the built-in `RX_SEED` until someone edits it, and only then is it stored in `data.settings.formulary` (so just opening Settings never bumps `rev`).
- Drug concentrations come from the clinic treatment sheet (`DRUGS`). Dexmedetomidine doses are in mcg/kg; the others are in mg/kg.
- Tests: `npm install && npm test` (jsdom). Run them after every change. When one fails, decide whether the test or the app is wrong.
- Publishing: use `../_github-toolkit` (`scan.sh`, `publish.sh`, `update.sh`) with this folder's `.github-publish.conf`.
