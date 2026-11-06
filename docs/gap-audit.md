# Gap audit — 6 November 2026

Audit started 6 November 2026. No Git repository is present; source was audited and fixed in place. External credentials were checked for presence only: all live service credentials are missing. No cloud mutations are authorized for this audit.

## Confirmed issues and implemented fixes

| Severity | Original evidence (before fixes)                                                                                                           | Implemented fix                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| High     | `edit`, `review`, `submit`, and `schedule` contain no expected version. CAS retries apply stale user intent to the newest content.         | Require version preconditions and make save-and-submit atomic.                                   |
| High     | Editing content with `manual_review` is allowed, and duplicate checks apply only to one version.                                           | Block content changes/publication while unresolved; provide explicit audited absence resolution. |
| High     | OAuth clears connections, writes secrets, then writes connections in separate requests. Disconnect deletes secrets after the state commit. | Transactional connection/secrets operations with membership checks.                              |
| High     | Membership is checked before a retried service-role write, not at commit; connection callback can race worker dispatch.                    | Recheck and lock membership in state commits and connection transactions.                        |
| High     | Metrics errors other than rate limits/token expiry are written as fresh null snapshots, concealing permission/provider failures.           | Distinguish unsupported metrics from failed collection and monitor each metric.                  |
| Medium   | Source uploads allow 8 MB through a Vercel function. Metadata insertion failure leaves an untracked object.                                | Enforce a consistent 4 MB source limit; normalize and compensate failed metadata writes.         |
| Medium   | AI validates space-joined captions, but the UI inserts two newline characters; empty captions are allowed.                                 | Shared caption assembly and exact validation.                                                    |
| Medium   | Demo mode disables UI integration controls but does not explicitly disable workers or server session creation.                             | Fail closed for live services while demo mode is enabled.                                        |
| Medium   | Browser refreshes can apply out-of-order responses and retain workspace state after access revocation.                                     | Order responses and clear live state when access is denied.                                      |
| Medium   | DST overlaps choose an implicit instant; invalid-date checks rely partly on upstream schema.                                               | Reject ambiguous/nonexistent local times and validate date input strictly.                       |
| Medium   | Tests add grants independently of migrations; restore test does not restore any secret or workflow history.                                | Test deployed migration grants directly and restore representative records.                      |

## Additional confirmed gaps fixed

- **High — publication recovery:** checkpoint writes were not fenced to a unique attempt, and a database failure could discard a known provider result. Attempts now have claim IDs, verify ownership before publishing, and persist a known remote ID again without repeating the provider write. Missing Facebook post_id is no longer replaced with a photo ID. Regression coverage: worker.test.ts.
- **Medium — OAuth readiness and reconciliation:** the callback now checks every required granted permission before one atomic connection RPC. Reconciliation requires the original account, exact caption, dispatch-time window, and a unique remote ID. Coverage: oauth.test.ts and domain regressions. Real Meta behavior still needs proof.
- **Medium — request/body boundaries:** source images are capped at 4,000,000 bytes; chunked multipart bodies are bounded even without Content-Length. Actual decoding, single-frame checks, white transparency, normalization, and failed-upload compensation are tested in body.test.ts, images.test.ts, and upload.test.ts.
- **Medium — AI accounting:** known token usage is retained even when output validation fails; unknown usage is null. Request limits require an integer and concurrent reservations are tested. Coverage: ai.test.ts and store.test.ts.
- **Medium — telemetry:** request/user/breadcrumb fields are dropped and credential keys, OAuth queries, bearer values, and configured secrets are redacted. Transaction tracing is disabled. Coverage: gaps.test.ts and security.test.ts.
- **Medium — keyboard and contrast:** small-text contrast was increased while preserving the design. Dialogs restore focus to their opener or the main heading; file uploads have visible keyboard focus. Automated axe checks cover all seven screens at desktop/mobile sizes, with a separate keyboard regression.
- **Medium — clean-checkout verification:** typecheck runs next typegen first. Browser tests use port 3100 and a separate build directory and refuse to reuse a server. Generated files are excluded from the archive.
- **Low — branding/history:** live hero text uses the saved brand name. Review decisions can be inspected per version. A read-only orphan report compares Storage objects, metadata, and every historical content reference; it deletes nothing.

## Verification and evidence

The baseline unit/integration suite passed 38 tests and the dependency audit reported zero vulnerabilities. Initial generated-type/build checks collided with another build; this was a validation-ordering problem rather than evidence of a source defect. Subsequent checks are sequential.

- **86 unit/integration tests across 12 files passed.** Tests include the actual PGlite migrations, RLS, CAS, transactional credential rollback, commit-time revocation, administrator serialization, and restoration of encrypted-secret bytes.
- The browser runner initially lacked its matching Chromium; the official Playwright browser was installed. A test selector was corrected to include the approval-count badge. The added keyboard test then found a genuine focus-restoration failure, which was fixed and retested. No test was disabled to hide a failure.
- Desktop/mobile accessibility checks and complete flow tests run through the Playwright CLI. Final counts and build/typecheck results are recorded in validation.md.
- The final dependency audit reports **zero vulnerabilities**. This is a dependency finding, not a security certification.
- No cloud publishing, invitations, access changes, migrations, or deployments were performed. Tests use local data and mocked provider responses; those are not live integration proof.

## Remaining limitations and external gates

**Readiness: local demo ready; staging candidate; not production-ready.** All live service credentials were checked for presence only and are missing.

1. **Supabase:** create staging/production projects, apply migrations 001–003, disable public signup, configure SMTP/invite links, bootstrap an admin, and prove invitation/password/session/revocation flows. Email delivery and membership creation cannot be one cross-service transaction; partial invite failures require admin repair before the invitee gains access.
2. **Meta:** configure the exact HTTPS callback, explicit supported Graph version, Page ID, and required account/app-review permissions. Complete integration-proof.md. Required scopes, eligibility, owner/timestamp fields, media limits, and available metric names are not proven by mocks. Direct Meta documentation was not fully accessible through browsing.
3. **Metrics:** initial Facebook impression/engagement names may be unsupported in a chosen API version. The application now reports that honestly. Production requires at least one proven numeric metric per platform and updated collector names/definitions where needed.
4. **OpenAI:** configure the key and exact model and verify actual structured outputs. The request-count cap does not replace provider currency/billing limits. An interrupted or timed-out call can have unknown usage.
5. **Workers/alerts/deployment:** deploy Trigger.dev separately with matching server secrets. Verify cron schedules, interrupted-worker recovery, notification routing, Sentry redaction, HTTPS origins, and Vercel deployment. Local compilation proves none of these cloud actions.
6. **Distributed outcomes:** no exactly-once guarantee is claimed. A remote write followed by a crash before durable acknowledgement still requires investigation. An administrator must inspect the original account and provider logs before confirming absence; the application never automatically republishes that outcome.
7. **Restore/storage:** perform a real Supabase database plus Storage restore drill, retaining the encryption key separately. Old unused objects or failed compensation require reviewed cleanup. The orphan report is read-only and was not run against a cloud account.
8. **Scale/retention:** preserve this single-team JSONB aggregate for the MVP. State/audit/metric history grows, and the UI loads the document as a unit. Monitor size and contention and design a reviewed archival policy or normalized migration before substantial volume or long retention. No historical records were automatically deleted in this audit.

## References consulted

- [Vercel function limits](https://vercel.com/docs/functions/limitations)
- [Supabase server-side clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- Installed Next.js documentation: Route Handlers, authentication, accessibility, Playwright, distDir, and typegen.
- [Meta Instagram API collection](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api), with explicit staging gates for unverified account/version behavior.
