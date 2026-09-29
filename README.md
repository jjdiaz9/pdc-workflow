# Pet Dental Clinic Visits

A single-file web app that takes each patient at Pet Dental Clinic through the visit, from check-in to discharge. It's built for iPad and also works in a desktop browser.

**Steps:** Check-in → Authorization (with owner signature) → Exam → Anesthesia → Dental chart → Discharge

Each step mirrors one of the clinic's paper forms (see `reference/forms/`). A step lists what's still missing before you mark it complete, and each visit prints as paper forms.

The Discharge step also prints **take-home medication labels** (DYMO 30252, 3.5 × 1.125 in). Pick a drug from the formulary, build the directions, tick cautions, and print one label per medication; the pet, owner, veterinarian and date come from the visit. The label's practice details, margins and the formulary are under **Settings → Medication labels / Formulary**. Printed labels can be exported as a dispensing log (.csv).

## Files

| Path | What it is |
| --- | --- |
| `index.html` | The whole app: HTML, CSS and JavaScript in one file, with no build step and no outside dependencies except Google Fonts |
| `tests/app.test.js` | Automated checks: saving, dose math, vitals flags, the three tooth charts, printing, and GitHub sync including conflicts and error messages |
| `package.json` | Only used to run the tests |
| `reference/forms/` | The clinic's source forms. Kept on this computer only and **not committed** (see `.gitignore`) |
| `AGENTS.md` | Project instructions and notes for Claude |
| `.github-publish.conf` | Settings for `../_github-toolkit`. Stays local |

## Running it

- **On this Mac:** double-click `index.html`, and it opens in your browser.
- **On the iPad:** host it on GitHub Pages (below), open the link in Safari, then Share → **Add to Home Screen**. Always use the Home Screen icon. Safari can clear a website's data after about a week without a visit, but a Home Screen app is exempt.

## Publishing to GitHub Pages

Use the shared toolkit. `.github-publish.conf` is already set up: repo `pdc-workflow`, public, with Pages on so the iPad can open it.

From Terminal, in the `Projects` folder:

```bash
bash "_github-toolkit/scan.sh" "Pet Dental Clinic Workflow App"
bash "_github-toolkit/publish.sh" "Pet Dental Clinic Workflow App"
```

`publish.sh` shows the files it will publish and asks before creating anything. For later changes:

```bash
bash "_github-toolkit/update.sh" "Pet Dental Clinic Workflow App" "What changed"
```

The app is served at `https://<your-username>.github.io/pdc-workflow/` about a minute after publishing.

If Pages isn't on yet, in the repo on GitHub go to **Settings → Pages**, set **Source** to *Deploy from a branch*, pick `main` and `/ (root)`, and save. The empty `.nojekyll` file tells Pages to serve the files as they are, without running Jekyll.

## Where patient data lives

Patient data is **never** stored in this folder or the public repo.

- Visits are saved in the browser on each device, automatically as you type.
- **Settings → Backups** exports and imports a `.json` backup. `.gitignore` blocks `*.json`, so a backup dropped in this folder can't be committed by accident.
- **Settings → Sync** can keep one JSON file in a separate private GitHub repo (path `pdc/visits.json` by default). This needs a fine-grained token limited to that one repository, with Contents read/write only. Sync is manual: **Pull** before a clinic day and **Push** after. If two devices both changed, the app asks which copy to keep and downloads the other one as a backup.

## Running the tests

```bash
npm install
npm test
```

## Changing the forms

The form wording is in `index.html`:

- New patient form: `stCheckin`
- Consent: `stAuth`
- Exam sheet: `stExam`
- Treatment sheet and monitoring grid: `stAnes`, `GRID_ROWS`, `DRUGS`
- Tooth charts and abbreviations: `CHARTS`, `CODE_GROUPS`, `LEGEND`
- Discharge sheet: `dischargeDoc`
- Medication labels: `labelHTML`, starter formulary `RX_SEED`, cautions `CAUTIONS`, label defaults `LBL_DEF`

Printed versions are in the `PRINT` object. Every form prints as a replica of the clinic's paper original with the visit's answers filled in: New Patient, Authorization, Exam and Discharge (`newPatientPage`, `authPage`, `examPage`, `dischargePage`, templates in `FORM_ART`), the dental charts (`chartPage`, `CHART_ART`), the treatment sheet and the monitoring form (`treatmentPage`, `monitorPage`). The templates were converted from the clinic's PDFs.
