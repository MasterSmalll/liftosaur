# Custom Metrics (fork feature, draft)

This branch adds custom measurements **inside Liftosaur's workout data**, not to a separate logging app.

## Capabilities

- In **Me → Workout → Custom Metrics**, create metrics with a stable ID, label, unit,
  scope (`set`, `exercise`, `workout`), and kind (`number`, `boolean`, `text`).
- Rename, change unit, or disable a metric without removing its recorded values.
- Record numerical, text or boolean metrics within the native workout screens.
- Track RIR per set by default. If no independently reported completed RPE exists,
  entering RIR fills an **estimated** RPE using `10 - RIR`. Explicit RPE takes precedence.
- In **Graphs → Custom Metrics**, view per-workout numeric averages with exercise,
  program and period filters.
- The data model uses optional `customMetrics` maps on `ISet`, `IHistoryEntry`,
  and `IHistoryRecord`; definitions live under `ISettings.customMetricDefinitions`.
  Old records are valid without these fields.

## Limitations before production

- This is an **unreleased fork feature**. The official liftosaur.com and existing mobile
  app cannot display these new fields until a custom build is installed and tested.
- Needs `npm ci`, `npm run check`, `npm run onetest ...` and native/web UI verification.
  These builds have not been run in the ChatGPT environment.
- Graphs display arithmetic means of recorded set/exercise values per workout; aggregation
  functions (maximum, totals, latest etc.) are a later iteration.
- Editing and export/import of new metric data via all native CSV/API formats is not yet
  implemented. Avoid relying on existing CSV export as a complete backup of custom values.
- Verify compatibility of offline synchronization and iOS/watchOS/Android clients
  prior to connecting this fork to production data.
- MacroFactor historical imports require a fresh granular export and program export.
  Keep the original raw files unchanged, map exercise IDs, and deduplicate by stable
  source identifiers and date/set fingerprint before importing.

## Core files

- `src/types.ts`: schema extensions and optional per-level fields
- `src/models/customMetrics.ts`: registry, validation, RPE estimation, graph aggregation
- `src/components/customMetricSettings.tsx`: in-app metric manager
- `src/components/customMetricFields.tsx`: shared data-entry controls
- `src/components/customMetricGraph.tsx`: history charts and filters
- `test/customMetrics.test.ts`: model-level unit tests

This feature is experimental and is proposed through a **draft PR in the user's fork**.
No production deployment or historical MacroFactor import has been made.

## MacroFactor Workouts CSV support (experimental)

- A generic importer is available from **Me → Import / Export → Import history from other apps → Upload MacroFactor Workouts CSV**.
- It opens Liftosaur's existing **Import Preview** with parse warnings, duplicate checks, explicit confirmation, and a reversible import session.
- Supports warm-up / standard sets, weights recorded in kilograms, bodyweight/external-load semantics, repetitions, and RIR (when present).
- A blank RIR stays blank. When RIR is present, an RPE estimate is explicitly marked as derived.
- `∈ SS1` etc. is interpreted as a superset marker, not part of the exercise name.
- Native exercise mapping: Conventional Deadlift → Deadlift (barbell), Barbell Back Squat → Squat (barbell), overhand pull-ups with/without added weight → Pull Up (bodyweight), Kipping Pull-Up → builtin Kipping Pull Up.
- Ambiguous dips are left as a custom exercise pending a chest/triceps variant choice.
- The export includes calendar dates and workout duration but **no actual start clock time**; the importer uses UTC midnight as a clearly documented date anchor for historical grouping only.
- Import IDs are deterministic, so importing the same CSV twice can be detected and skipped in the standard preview. Existing data is not overwritten.
- Unusually large groups of identical sets are shown as warnings rather than silently combined.

### Data protection

**Do not commit anyone's personal workout export to this public fork.**
The code and unit-test fixtures use generic synthetic workout data only.
The personal MacroFactor CSV remains in its original private Google Drive folder.

### Export compatibility

The granular MacroFactor Workouts CSV is **historical workout data**, not a complete
program export. A separate MacroFactor program export is needed to reconstruct
future planned exercises, weeks, targets and progression rules.

## Web-first rollout and complete workout history

The initial delivery target is the existing **web/PWA user experience**, not a new live-workout application.

The fork includes **Graphs → All Workouts — History**, a read-only dashboard built on
`storage.history` (the same Liftosaur records used by the app's existing workout list).
It provides:
- Last 90 days / year / all-time, program and exercise filters
- Working sets, repetitions, training time and Liftosaur-calculated volume totals
- Per-workout, weekly (ISO Monday) or calendar-month graph aggregation
- A chronological record list with expandable exercise summaries
- Works with historically imported MacroFactor Workouts and native Liftosaur records

**Interpretation:** The volume calculation delegates to Liftosaur's existing
`History_totalEntryWeight`; it does not independently reconstruct total
bodyweight-plus-external-weight for all calisthenics movements. Exercise filtering
preserves the complete *session* duration, not time per exercise. Unknown durations
are not converted into huge running durations.

### Web deployment / connector interoperability

- The official `liftosaur.com/planner` URL is a program planner.
  The app and workout history are at `liftosaur.com/app`.
- Installing a GitHub fork does **not** patch Liftosaur's hosted
  website, native mobile app, public API backend, or ChatGPT connector.
- The fork's web frontend can be built and hosted separately, but sharing live account
  data and custom metric synchronization requires validated backend/API compatibility,
  authentication, cross-origin policy, versioned migrations, and rollback.
- Until independently proven, keep the existing hosted Liftosaur account and the
  ChatGPT connector as the authoritative record; use JSON/CSV backups before trying
  a separate fork deployment.
- **Do not** connect an experimental fork directly to the official account in a way
  that can overwrite or silently discard unknown custom fields.
- Native iPhone and Apple Watch builds are out of scope for the first phase.
