# Liftosaur fork ↔ ChatGPT : MCP enrichment and safe migration

This fork extends the **native Liftosaur MCP server**, rather than adding a separate workout log.

## Data accessible from the fork MCP

The existing Liftosaur MCP tools remain available for program Liftoscript, custom exercises,
per-exercise settings, gyms, equipment and body/health measurements. Five new tools add:

| Tool | Function | Permissions |
|------|----------|-------------|
| `get_structured_history` | Paginated typed history, complete sets and warmups, RIR/RPE provenance, notes, custom metrics and optionally current progress | Read |
| `list_custom_metrics` | Metric definitions, units, types and scopes | Read |
| `get_training_analytics` | All-time workout totals, time series, exercise/program filters and numeric metric trends | Read |
| `upsert_custom_metric` | Create/rename/disable a metric without deleting historical values (kind and scope locked) | Write |
| `set_history_metric` | Record or clear a typed custom value on a historical workout, exercise or working/warmup set | Write |

The existing `get_history` tool serializes to Liftohistory text, which cannot represent
all custom metric fields. **Prefer `get_structured_history` for complete-fidelity analysis.**

RIR remains a separate numeric metric from RPE. When no RPE is entered, RPE may be
*derived* as `10 - RIR` and marked with `rpeDerivedFromRir`.
Values not captured by a workout or import must not be inferred.

All tools require the existing Liftosaur bearer authentication; the custom tools do not
create a public route or bypass user authorization or subscription checks.

## Two accounts/endpoints are different until migration

**Official connection now**
- `https://www.liftosaur.com/mcp` points to the official Liftosaur service.
- The user's existing ChatGPT Liftosaur plugin calls the official endpoint.
- No push to this GitHub fork modifies the original MCP endpoint, original server
  storage, or the official hosted web app.

**Fork connection later**
1. Deploy the fork's frontend and backend behind a user-controlled HTTPS origin.
2. Configure server, DNS, OAuth authorization and token endpoints, secrets, allowed origins,
   storage database, CORS, subscriptions and account login independently.
3. Backup the original Liftosaur account using complete native backups; verify all
   imported MacroFactor history, saved programs, custom exercises, measurements and timezones.
4. Restore to an **isolated** backend. Verify counts and per-record IDs and all custom values.
5. Test OAuth login and the `/mcp` endpoint using a separately named ChatGPT custom plugin/
   MCP integration, configured with the deployed URL (do not substitute a GitHub repository URL).
6. Read-only verification first; then write a test metric to a disposable record and
   validate that the native web UI and MCP return the same value.
7. Only after sign-off, make the new fork authoritative. Avoid writing to both
   official and fork environments at the same time, or duplicates/data divergence may occur.

Do **not** hardcode API keys, access tokens, passwords, OAuth secrets or account exports in
GitHub or in documentation. Keep generated backups private and encrypted. Avoid exposing
raw fitness history publicly.

## Current stage

The code and tests are in the experimental `feature/custom-metrics-rir` branch.
There is no deployed fork MCP host, and the official ChatGPT connector cannot be
automatically repointed to this fork. Publishing and OAuth configuration remain to be done.

Data types served depend on what Liftosaur has actually recorded. If a field such as
bar velocity, tempo or RIR was never captured, neither the connector nor a custom metric
can reconstruct it without external measurements.
