# Audit verification — 6 November 2026

| Check                   | Final result                                                                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript              | Passed: next typegen then tsc --noEmit                                                                                                                   |
| Unit/integration tests  | 86 passed across 12 files                                                                                                                                |
| Production build        | Passed: Next.js webpack build, including TypeScript and all app routes                                                                                   |
| Playwright CLI          | 7 passed; isolated demo server on port 3100                                                                                                              |
| Screen coverage         | All seven screens checked at 1440px desktop and 390px mobile widths                                                                                      |
| Automated accessibility | No WCAG A/AA violations in the exercised screen/dialog states                                                                                            |
| Keyboard regression     | Focus trap, visible upload focus, Escape close, and opener focus restoration passed                                                                      |
| Browser errors          | No page runtime errors in the screen checks                                                                                                              |
| Workflow                | Approve → schedule → edit invalidation, actual entered date validation, persistence, role controls, and atomic save/submit passed                        |
| Uploads                 | Real PNG normalization, malformed/oversized input rejection, bounded multipart bodies, and failed-metadata compensation tested locally                   |
| Database                | All three migrations exercised on PGlite with real grants/RLS, CAS, transactional connection rollback, commit-time revocation, and administrator changes |
| Backup                  | Local restore verified versions, approvals, remote publication ID, metrics, memberships, and encrypted-secret bytes                                      |
| Clean source            | Typecheck passed without .env files, next-env.d.ts, or build outputs; reused already installed dependencies through a local junction                     |
| Dependency audit        | Zero reported vulnerabilities                                                                                                                            |

## Test inventory

Vitest covers domain rules, stale intents, direct API permissions, compare-and-swap retry conflicts, AI quotas/refusals/formatting/usage, OAuth state/scopes, provider outcomes and claim fencing, metrics, image decoding, body limits, credential redaction, upload cleanup, migrations, and local restore.

Playwright covers:

1. Approval, schedule, past-date rejection, editing, and persistence.
2. Creator controls and mobile overflow.
3. All seven desktop screens with axe checks and screenshots.
4. All seven mobile screens with axe checks and screenshots.
5. Image upload, sample generation, edited draft, and atomic review submission.
6. Direct live-service rejection while demo mode is enabled.
7. Keyboard focus visibility, trapping, and restoration.

The keyboard test initially failed because focus was not restored after closing a controlled dialog. The fix was applied and the complete suite passed afterward. The matching official Chromium browser was installed for this audit. No tests were disabled to hide failures.

## Verification limits

Live OpenAI calls, Meta OAuth/publishing/insights, Supabase deployment and Storage restore, actual invitation email/password onboarding, Trigger.dev cloud schedules/alerts, Sentry delivery, and Vercel deployment remain unverified because their credentials and accounts are absent.

PGlite is a local PostgreSQL-compatible engine. Its tests do not prove a real Supabase restore. Mocked provider outcomes do not establish real Meta permissions, current metric names, or exactly-once publishing.

No real social posts, invitations, cloud migrations, deployments, or access changes were performed. No secrets, dependency directories, generated route files, browser caches, or build outputs are included in the source archive.

Readiness: local demo ready; staging candidate after service configuration; not production-ready until the external checks in integration-proof.md and operations.md pass.
