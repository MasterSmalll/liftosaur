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
