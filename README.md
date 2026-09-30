# Pet Dental Clinic Visits

A single-file web app that takes each patient at Pet Dental Clinic through the visit, from check-in to discharge. It's built for iPad and also works in a desktop browser.

**Steps:** Check-in → Authorization (with owner signature) → Exam → Anesthesia → Dental chart → Discharge

Each step mirrors one of the clinic's paper forms (see `reference/forms/`). A step lists what's still missing before you mark it complete, and each visit prints as paper forms.

The Exam step has a **body map** for dogs, cats and ferrets: tap the ventral or dorsal figure to mark a mass, then describe it. Marks print as numbered rings on the exam sheet's figures, with the descriptions under C/S. The dog and cat maps are the exam sheet's own figures; the paper has no ferret, so a ferret figure in the same style prints in their place for ferrets.

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

## Example patients

The app starts with three example visits for demos: Miso has just arrived, Biscuit is under anesthesia, and Maple's visit is complete from check-in to discharge (every form filled in, signed consent, charted extractions, printed medication labels). They stay on the device and never sync. Remove them from the Visits board or **Settings → Example patients**, and add them back from the same Settings panel.

## Where patient data lives

Patient data is **never** stored in this folder or the public repo.

- Visits are saved in the browser on each device, automatically as you type.
- **Settings → Backups** exports and imports a `.json` backup. `.gitignore` blocks `*.json`, so a backup dropped in this folder can't be committed by accident.
- **Settings → Sync** keeps one JSON file in a separate private GitHub repo (path `pdc/visits.json` by default). This needs a fine-grained token limited to that one repository, with Contents read/write only. Once set up, each device syncs by itself a few seconds after an edit, when the app opens or comes back on screen, when the connection returns, and every minute while it's open. Changes are merged field by field against the last copy the devices had in common, so two iPads can work on different patients, or on different parts of the same visit, at the same time. If two devices change the same field at the same moment, the device that syncs later keeps its value and lists the other one under Settings → Sync, with **Use other** to switch. The example patients stay on each device and are never synced.

## Running the tests

```bash
npm install
npm test
```

## Changing the forms

The form wording is in `index.html`:

- New patient form: `stCheckin`
- Consent: `stAuth`
- Exam sheet: `stExam` (body map: `bodyMapUI`, `bodyMapTap`, `bodyMapPrint`, marks in `v.exam.masses`)
- Treatment sheet and monitoring grid: `stAnes`, `GRID_ROWS`, `DRUGS`
- Tooth charts and abbreviations: `CHARTS`, `CODE_GROUPS`, `LEGEND`
- Discharge sheet: `dischargeDoc`
- Medication labels: `labelHTML`, starter formulary `RX_SEED`, cautions `CAUTIONS`, label defaults `LBL_DEF`

Printed versions are in the `PRINT` object. Every form prints as a replica of the clinic's paper original with the visit's answers filled in: New Patient, Authorization, Exam, Treatment Notes and Discharge (`newPatientPage`, `authPage`, `examPage`, `treatmentPage`, `dischargePage`, templates in `FORM_ART`), the dental charts (`chartPage`, `CHART_ART`) and the monitoring form (`monitorPage`). The templates were converted from the clinic's PDFs. Printing waits until the pictures on the page are decoded (`imagesReady`), since Safari otherwise prints before it has drawn them.
