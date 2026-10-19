# Three distinct load indicators (experimental fork)

The fork now records three **different** concepts for strict pull-ups and
unassisted parallel-bar dips with *known added-weight semantics*.

1. **External added weight** (kg): the original recorded ballast, unchanged.
2. **Full statically supported mass** (kg): bodyweight on the workout's calendar
   date plus the added ballast. When suspended motionless, the arms support the
   entire system mass. This is NOT the force in each muscle, and the force during
   acceleration can differ.
3. **Coefficient-adjusted equivalent resistance** (kg):
   `externalKg + bodyweightKg * contributionFraction`. The percentage approximates
   effective body-mass involvement in a **particular** movement. It is not measured
   muscular force or joint stress.

Example (only when the source data are available):
- Athlete 85 kg; added ballast 20 kg
- Total statically supported mass: 105 kg
- User-specified *hypothetical* 95% contribution: equivalent resistance 100.75 kg.

## No unverified default coefficients

MacroFactor documents exercise-dependent Bodyweight Contribution, but we do not
have an authoritative complete table of its actual coefficients. Do not make
up 92% dips/95% pull-ups/60% squat as guaranteed MacroFactor defaults.

The graph editor has no prefilled percentage. The user may enter a validated
number 0–100, with a source:
- `user-confirmed-macrofactor`: a number inspected by the user inside MacroFactor;
- `study-based-estimate`: a number from a cited biomechanical source;
- `user-estimate`: a provisional assumption, not validated.

The editor also stores a free-text reference and an `effectiveFrom` calendar
date; the earliest entry can apply to historic workouts (e.g. 1900-01-01).
A new dated revision does not retroactively alter the coefficients selected for
older workout dates. Entries live under
`settings.exerciseData[exerciseKey].bodyweightContributions`, not on each weight
record.

If coefficient, bodyweight for the exact date, or added-load interpretation is
missing, equivalent resistance is **not calculated**. Missing values are never
replaced with 0 or filled by interpolating a previous weight.

## Graph behavior

The native **Graphs → Pull-ups and dips** module shows:
- A line for the actual added load;
- Separate measured/estimated-bodyweight lines for full static support;
- Separate measured/estimated-bodyweight lines for equivalent resistance;
- A historical list with reps, loads, percentage and coefficient provenance.

Both derived indicators require known *external ballast* semantics and bodyweight
evidence. The load conversion does NOT modify the recorded set weights, exercise
history, 1RM, or historical import.

The date-specific choice is made in
`Bodyweight_contributionForWorkout`; work sets are rendered by
`Bodyweight_performance`. Existing `get_bodyweight_load_progression` MCP
returns these additional fields automatically when used against a future
deployment of the fork.

**Scope limitation:** this initial UI is only for strict pull-ups and dips.
Coordinated movement variants, push-ups, squats, unilateral movements, and
assisted exercises require biomechanical and loading-specific logic before
being analyzed with percentage-adjusted resistance.

## Validation

Automated tests cover 0/60/92/95/100% math, historical revisions,
missing dates and weights, provenance, and non-double-counting of native sets.
Web UI and offline sync are not yet verified in a deployed fork, so keep the
current official Liftosaur records intact.
