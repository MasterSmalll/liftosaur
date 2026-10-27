# Audit : MacroFactor Workouts bodyweight contribution and fork analytics

Date: 2026-10-19. Scope: **code and source-data verification, no production data modification**.

## Source-grounded formula

MacroFactor Workouts documents an exercise-specific **Bodyweight Contribution** percentage and a separate additional resistance field; it lets custom exercise definitions set a contribution percentage:
- https://help.macrofactorapp.com/en/articles/315-understanding-bodyweight-contribution
- https://help.macrofactorapp.com/en/articles/328-how-to-create-a-custom-exercise

General normalized resistance for one rep:
`external added resistance + (bodyweight * exerciseFraction) - separately quantified assistance`.
`exerciseFraction` belongs to an exercise (and ideally versioned definition), not to the user's profile alone.

**The precise MacroFactor coefficient catalog and proprietary progression implementation are not published in the documentation we found.** Never describe third-party anecdotes (e.g. 95% pull-up, 92% dip, 60% squat) as verified MacroFactor defaults. The publicly documented formula does not license copying proprietary progression internals.

### Exports are not coefficients

The MacroFactor Workouts granular CSV contains `Exercise Base Weight (kg)`, but this is *not* the bodyweight contribution coefficient. In the inspected workout file its values were empty or `0`; the `RIR` column was empty in all 97 original set rows.

## Historical import audit (verified privately, no raw user data in Git)

Comparing the source granularity to the official Liftosaur text history for the six workout dates:
- Source 97 sets vs destination 97 sets; per-date work/warmup counts match.
- Total rep counts and external weighted tonnage match on each date.
- Kipping exercise display name has punctuation normalized in Liftosaur.
- Superset grouping is retained in text notes on the **previous manual import**, not as a structured link; re-importing a generic CSV in the fork has different structural behavior.
- Original workout names exist in notes but are not necessarily preserved in native `dayName` of the manually added records.
- No original start clock time; `00:00Z` is solely a calendar-date anchor.
- Blank RIR in source must stay blank; do not infer past intensity.

The user's official Liftosaur account has weight measurements, but none on the six original MacroFactor workout calendar dates (Europe/Paris). The current fork correctly labels missing same-day weights as unknown unless a distinct trend estimate is imported.

Duplicate identical weight records can exist on one day. A repetition of the same measurement is not proof of independent scale readings.

## Verified code-path strengths

- `src/models/bodyweightPerformance.ts` separates measured, trend-estimated and missing weight and refuses to double-count unclassified native bodyweight exercise weight.
- `lambda/utils/statRowWrites.ts` stores imported trend under dedicated type `trend` instead of `weight`; stale clients omitting this key do not delete trend rows.
- Kipping and assisted pull-ups are excluded from strict-load progression.
- TypeScript check and the seven targeted test files passed: GitHub Actions run 39211028380, **166 passing**.

## Audit findings requiring fixes or explicit limitation

1. **High — Unknown per-exercise contribution.** `Bodyweight_performance` currently assumes **100%** of bodyweight for supported imported pull-ups/dips. MacroFactor has exercise-specific factors, and our implementation does not yet support user-confirmed exercise percentages. This is a provisional mechanical 100% model, not a MacroFactor-exact calculation. Do NOT silently label output "MacroFactor total load" or transplant this assumption to squat/deadlift.
2. **High — Historical weight coverage.** Same-day measured weights are not present on the six inspected workouts. A separate, private trend import is required before estimated total-load charts can populate. Do not forward-fill old weigh-ins without an explicit policy.
3. **Medium — Multiple same-day measurements.** `Bodyweight_forWorkout` currently takes the *earliest* measured timestamp in a calendar day when there are several. Define and document a deterministic policy (latest prior to known workout start, else latest same-day or robust daily aggregate) and expose actual provenance.
4. **Medium — Analysis comparability.** `Bodyweight_bestSessionSets` chooses max external load per session regardless of reps, RPE/RIR and technique. It is a heaviest recorded set chart, not a verified force/1RM progression. Comparative graphs should optionally match reps and RIR, and show the raw work sets.
5. **Medium — Dashboard exercise filter.** Durations in `WorkoutHistory_summarize` remain the **full workout duration**, even when an exercise is selected. Show as session duration, not exercise time.
6. **Medium — Import fidelity.** Existing manual historical import carries supersets/workout labels in comments rather than structured fields; future imports should preserve both explicit source metadata and actual entry-level grouping.
7. **Medium — Data export/migration.** Custom metric and trend fields need JSON backup/restore and mixed-client sync integration testing; targeted unit tests alone are not production proof.
8. **Low — CSV robustness.** MacroFactor trend parser uses naive comma splits. Replace with a real CSV parser to support quoted headers/cells and provide strict size/header/dedup validation.

## Proposed next design (NOT implemented by this audit)

- Add `bodyweightContributionFraction` (0–1, nullable) as a **per-exercise setting**, plus provenance: `userConfirmedMacroFactor`, `manualEstimate`, `measuredMethod`, and optional validity dates.
- Preserve the raw external load untouched. Derive a separate `normalizedResistance` field; distinguish exact source coefficient vs user estimate, recorded scale weight vs trend estimate.
- Display no "MacroFactor-equivalent" numeric metric when coefficient missing; show an explicit "100%-assumption view" only if chosen.
- Support both working and assisted exercises explicitly using negative assistance or a separate aid amount.
- Add tests for 0%, 60%, 92%, 95%, 100% and missing coefficients; verify no bodyweight counted twice, negative assistance, unknown dates, different rep counts, and weight-unit conversions.
- Introduce a consistency report for source rows vs imported records and versions of formulas used for previously calculated metrics.

No user's actual private workout CSV or individual weigh-in values were committed to this public repository.
