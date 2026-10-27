# Session 03 architecture

Netlify owns session/workspace authorization and deterministic readiness; DeerFlow owns bounded model advice. John is synthetic staging only. Netlify authenticates the tester, checks trusted context.site.id equals 96331e39-86a9-45a3-910c-edd321d60bb7 and RIGOR_JOHN_STAGING_ENABLED equals true, then permits only synthetic productions. A deploy context label alone never authorizes staging.

DeerFlow authenticates X-RIGOR-Service-Token before enabling John via its own default-off flag. Existing JohnPmAgent supplies a fixed system policy, no tools and validated source IDs. Its response is always MODEL_ADVISORY_ONLY/HOLD_SHOW with autonomous approval false. No production record mutation or human approval is delegated.

Current branch and separately published recovery/production backends diverge. Reconcile their behavior and acceptance evidence before any production release; do not replace one history wholesale.
