# RIGOR beta checks

This module publishes `app/static` and bundles `netlify/functions/rigor-api.mts`.
`netlify.toml` explicitly runs `npm run check` before function bundling.

Run `npm run check`, `npm test`, and `npx netlify build --context production`
after reliability changes. Run the focused backend RIGOR tests listed in
`.github/workflows/rigor-beta-ci.yml` when verifying the DeerFlow bridge.

Department PDF callers must pass scoped requirements, conflicts, checkpoints,
and incidents to `readiness`. Master reports and workspace readiness use the
complete production. Keep department isolation covered by regression tests.

Never print environment values or session cookies. Verify configuration by
presence and an authenticated ingestion result. Building does not authorize
deployment.
Dependency security gate: Node.js 24, Netlify Functions 6, CLI 27, and Vitest 5. The CLI-scoped sharp 0.35.5 override patches its image-tool dependency. Full and production-only npm audits must pass; CI must fail on a production audit failure.

Pod 2 rules: canonicalize source facts before building conflicts. Keep original model labels for audit; never compare unlike physical constraints as the same category. Include affected departments in report scope and readiness. New contradictions must reopen affected checkpoints, and source review must remain a separate gate from requirement confirmation. Source reconciliation is a rule-assisted candidate pass, not an exhaustive extraction guarantee. Uploaded documents require explicit full-source review; only labeled sample documents bypass that gate. Exercise the eight-constraint scenario and recorded DeerFlow omission regression before releasing these rules.

Company pulse attempts must persist RUNNING/COMPLETE/FAILED independently of pulse/latest; health must degrade after a newer failed or timed-out attempt. Never use a background 202 response or configured=true as execution proof. Run scripts/live-pod-proof.py for live product gates; a fallback result does not pass the DeerFlow bridge gate. Keep synthetic evidence and cookies out of commits.

Founder invitation workaround: `/founder` accepts a pasted HTTPS invitation link from the current deployment host or the project production host. Parse locally, clear the input immediately, and keep the token only in memory until `@netlify/identity` accepts it. Never navigate to a pasted URL, log it, or persist it in browser storage. Cover rejected hosts, protocols, and missing/duplicate tokens.

For Founder-triggered company cycles, propagate sanitized execution failure codes to the command receipt while maintaining last-attempt health. Scheduled/background invocations retain their durable failure behavior. Never publish raw upstream response bodies.

Founder presentation uses text-only DOM rendering in `app/founder-report.ts`; never insert model HTML into the page. Raw evidence belongs in collapsed details. Keep review completion distinct from release readiness and only show verified delegation from a correlated server execution receipt. Company context must use the deployed commit from build metadata and filter CI to that exact SHA; missing metadata is unknown, never a feature-branch fallback. Prior saved model assessments must not be promoted to verified test failures.

Company preview history now uses an isolated, branch-scoped site store with strong consistency, distinct from production. All company readers/workers share `_shared/company-store.ts`. PR 11 history is conditionally recovered from its prior deploy once; migration never overwrites newer data, reruns completed commands, or automatically resumes recovered actions. Unknown branch contexts retain deploy isolation.
