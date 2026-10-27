# Session 03 evidence log — October 27, 2026

Starting branch/commit and clean working state verified from actual worktree. Saved October 14 checkpoint records historical 80 product/46 focused backend checks and live workspace creation. Current staging deploy queried directly: 6ae0cef7347d3442775df89a at 8ab134919b7b4dec5759ebb276a786d7101ea2d8, ready, source archive true. Netlify access-control query retains all-deploy SSO. Environment inventory checked names/scopes only.

Regression evidence: john-auth-before.txt shows four failures; john-endpoint-before.txt shows six route failures. Final checks: app-final.txt (87 tests/typecheck/build script), rigor-backend-after.txt (58 tests), dependency audit JSON reports zero after compatible lock refresh. Broad suite before/after stops on unchanged POSIX mode 0666 versus expected 0600 on Windows; initial unrestricted temporary-directory run was interrupted after environment errors and is not counted as a full result.

External logs live under outputs/RIGOR-SESSION03-JOHN/evidence in the task workspace. Render dashboard historical deployment dep-dbgbuiflk1mc73babs40 succeeded at 9a21b178; current direct health timed out. No new model call or repaired deployment is inferred from historical success.
