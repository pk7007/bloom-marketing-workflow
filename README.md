# Bloom — AI Marketing Workflow

A private Next.js application for a team creating Instagram and Facebook image posts. Includes a working local demo and a server implementation for Supabase, OpenAI, Meta, and Trigger.dev.

## What is implemented

- Dashboard, content studio, image upload, caption generation and rewriting, version history, approval inbox, timezone-aware calendar, analytics, brand settings, team invitations and roles, connection management, and audit history.
- Approval applies to the current content version. Caption/image edits invalidate approval and cancel scheduled publication. Moving the time preserves approval. Creators cannot approve, schedule, cancel, or reconcile publications.
- Server-validated JPEG uploads, server-only API calls, encrypted Meta tokens, OAuth state verification, private storage, workspace RLS, AI usage reservations, atomic publication claims, bounded rate-limit retries, and manual review for ambiguous provider outcomes.
- Scheduled publishing and analytics jobs; health checks surface failures through Trigger.dev alerts. Optional Sentry server instrumentation.

## Quick start: local demo

Install **Node.js 24** before running `npm ci` on any machine, including Windows. This checkout also includes a project-local Node 24 development dependency, but it does not replace that installation prerequisite for a clean checkout.

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open the URL printed by Next.js. Set `APP_URL` to that exact origin (for example `http://127.0.0.1:3000`). The included local `.env.local` is already configured for this machine.

Demo mode is explicit: `DEMO_MODE=true`. Content persists in this browser's localStorage. Role switching affects only the demo. Captions use local sample templates, social accounts are simulated, and scheduled posts never publish. The demo does not generate fake analytics. Reset demo recreates sample content. Uploaded images stay in localStorage in demo mode and may hit the browser storage limit; use small images.

**Production rejects demo mode by default.** Never set `ALLOW_DEMO_DEPLOYMENT=true` for a real business workspace. Production access is invitation-only Supabase authentication, not the local demo identity.

## Configure live services

### 1. Supabase

1. Create separate staging and production projects. Run `supabase/migrations/001_foundation.sql`, then `002_reporting_views.sql`, then `003_atomic_security.sql` in each project's SQL editor, or use the Supabase CLI migration workflow. Existing installations must apply migration 003 before upgrading this app and its workers.
2. In Auth, **disable public signups**, configure your SMTP provider, set your Site URL to `APP_URL`, and allow `${APP_URL}/auth/callback` as a redirect URL.
3. Set the invitation email template link to `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}`. This enables the server's invite-verification callback rather than an implicit access-token fragment.
4. Create your first admin user in Supabase Auth with an initial password. Supply the Supabase URL, anon key, and service role key in `.env.local`. Service keys must never have a `NEXT_PUBLIC_` prefix.
5. Bootstrap the empty workspace once. Set `ADMIN_EMAIL` in your shell to the existing admin user's email, then run:

```powershell
node --env-file=.env.local scripts/bootstrap.mjs
```

6. Put the returned `WORKSPACE_ID` in the environment. Set `DEMO_MODE=false`. Sign in and save your real brand profile. The live workspace starts empty; demo data is never imported.

Use the application to invite additional users. Membership is required even if a valid Supabase session exists. Revoked members lose access on their next request.

### 2. OpenAI

Set `OPENAI_API_KEY`, `OPENAI_MODEL` to an available model supporting Responses structured outputs, and `AI_MONTHLY_REQUEST_LIMIT`. Requests reserve quota atomically before contacting the provider. Failed/unfinished requests still count. Model ID, usage, status, and prompt version are retained; provider response storage is disabled. Three options are generated per requested platform. AI output is checked for schema, count, and caption length; humans verify factual claims.

The request cap uses UTC calendar months. Provider billing limits and alerts must also be configured in the provider account. The app's cap counts requests, not currency, and does not replace a billing limit.

### 3. Meta: prove access before launch

The connection uses Facebook Login and requires a Facebook Page linked to an Instagram professional account.

Set `META_APP_ID`, `META_APP_SECRET`, a currently supported **explicit** `META_GRAPH_VERSION` such as `vNN.N`, and `META_PAGE_ID`. The app version is configured because account access and available metrics must be proved against your actual Meta application before launch; no version is silently assumed. If only one accessible Page exists, `META_PAGE_ID` may be omitted. Selection otherwise requires that explicit ID.

Generate `TOKEN_ENCRYPTION_KEY` with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Store the key securely outside source control and back it up separately. Rotating it requires reconnecting accounts or re-encrypting existing tokens.

Register `${APP_URL}/api/meta/callback` as an exact valid OAuth redirect. For production use HTTPS. Configure the app's privacy policy and data-deletion instructions with your actual business details. The requested permissions are:

```text
pages_show_list
pages_read_engagement
pages_manage_posts
read_insights
instagram_basic
instagram_content_publish
instagram_manage_insights
```

Confirm the current permissions and access levels in Meta's dashboard. Development/test roles and production access differ; app review or business verification may be required. The app connects a Page and its linked Instagram account, using an encrypted Page access token for each platform.

Before production approval, record evidence in a copy of `docs/integration-proof.md`: accounts, API version, granted scopes, approved image-post results, and at least one supported metric per platform. This proof **has not been run** in the delivered project because no Meta credentials were provided. Never treat successful local tests as proof of Meta access.

The app uploads/normalizes images to JPEG. Instagram validation supports a width of 320–1440 and aspect ratio 0.8–1.91; Facebook requires at least 200×200. Check these rules against your chosen API version during integration proof. Source files are consistently limited to **4,000,000 bytes (4 MB)** in the client and server. The complete multipart body is bounded to this limit plus 64 KiB, leaving room below the [Vercel function request limit](https://vercel.com/docs/functions/limitations), even without Content-Length. Processed JPEGs must remain under 8 MiB. Invalid/animated files are rejected, metadata is stripped, and transparency is flattened to white. If metadata insertion fails, the server attempts to remove the newly uploaded object and reports any cleanup failure.

Metric names and permissions vary by API version. Initial collectors request Instagram `reach`, `likes`, `comments`, `saved` and Facebook `post_impressions_unique`, `post_engaged_users`. These names remain unverified for your account/version. Explicit unsupported-metric errors are marked Unsupported. Permission, credential, rate-limit, and network failures are collection errors and fail the worker task. Empty results remain pending. Same-day snapshots are deduplicated; an actual measured zero is preserved. Replace deprecated metric names after proving available replacements; keep their definitions distinct. Publishing access does not establish insights access.

### 4. Trigger.dev

Create a project, set `TRIGGER_PROJECT_ID` and `TRIGGER_SECRET_KEY`, and configure the **same live server environment** in Trigger.dev, including Supabase service credentials, workspace ID, encryption key, Meta settings, and APP_URL. Never copy demo settings into the worker environment.

```powershell
npm run jobs:dev
npm run jobs:deploy
```

These commands invoke the vendor's pinned CLI on demand. The CLI is not installed in the web application's dependency tree. Review the vendor CLI and its own dependencies when upgrading it.

- `publish-due-posts`: every minute, claims due publications via database compare-and-swap.
- `collect-post-metrics`: 02:00 UTC daily, collects available metrics for posts published in the previous 30 days.
- `workflow-health-check`: every 15 minutes, fails visibly if publishing failures or overdue jobs need attention. Configure Trigger.dev failure notifications to the administrator. The app does not send operational email without that provider configuration.

The recurring sweeper is the durable scheduling mechanism. Each claim has a unique fence ID; an old worker cannot overwrite a newer attempt. A known provider post ID is persisted again after a transient database failure without republishing. This is not an exactly-once guarantee across two services. Jobs recheck the approved version, and uncertain publishing outcomes require manual review. Preparation failures, explicit rate limits, and pending Instagram processing use bounded retry. Reconciliation checks the original account, exact caption, dispatch-time window, and uniqueness. Unresolved outcomes block editing and scheduling for the entire content item. After ten minutes, an admin who has investigated and confirmed absence can record notes with “Record confirmed absence”; this never republishes automatically.

### 5. Vercel and monitoring

Import this directory into Vercel as a Next.js project, choose Node 24, and configure all server variables separately for staging and production. Set `APP_URL` to each environment's canonical HTTPS origin, and keep `DEMO_MODE=false`. Run `npm run build`. Deploy Trigger.dev workers separately; Vercel does not run them automatically.

Set `SENTRY_DSN` to enable server error reporting. Request, user, and breadcrumb objects are removed; credential keys, bearer tokens, OAuth query values, and configured secrets are redacted. Transaction tracing is disabled to avoid exporting sensitive provider URLs. Configure Sentry alerts and provider spend alerts in their dashboards. Supabase service secrets and encrypted tokens are never returned by app endpoints.

## Data architecture

This first release stores workflow records in a **workspace JSONB aggregate** with a revision counter. A compare-and-swap PostgreSQL function commits edits, version approval, schedule changes, and publication claims atomically. This is a deliberate small-team implementation choice rather than separate writable relational tables for every record.

Workspaces, memberships, assets, and encrypted social secrets are relational tables. Security-invoker read views expose content items, versions, approvals, publications, metrics, AI usage, and audit events. All tables use RLS; clients cannot write workflow tables or access secrets. Server commands authenticate users and enforce roles before using the service client. Job workers use the same atomic store.

The aggregate approach keeps cross-record rules consistent for a single team. For high post volumes, long retention, or multiple businesses, migrate workflow collections to normalized tables with transactional database functions before scaling; avoid simply increasing the JSON document indefinitely. The current UI fetches the workspace as a unit.

Migration 003 rechecks and locks membership/role at commit time, serializes administrator changes, and updates connection state and encrypted secrets transactionally. Content commands require the exact `expectedVersion` for edit, submit, review, and schedule; stale intent returns HTTP 409. Saving edits and submitting for review is one atomic command. Editors/reviewers freeze the version they opened, and review decisions are inspectable. Live state refreshes every 30 seconds; superseded responses are ignored and workspace data is cleared after access denial or sign-out. Server sessions and worker entry points reject demo mode even if credentials are configured.

AI uses the same caption assembly as the editor, including the newline separator. Blank captions and malformed hashtags are rejected. Known token usage survives output-validation failures; unknown usage is null. Failed/reserved calls still count toward the request cap, which does not replace provider billing limits.

## Verification

```powershell
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Vitest covers permissions, stale versions, atomic submission, scheduling/DST handling, image decoding, bounded bodies, provider recovery, OAuth, AI quotas and token accounting, and actual PostgreSQL RLS/CAS/backup behavior using PGlite. Playwright runs a dedicated demo server on port 3100 and refuses to reuse another server. It checks all seven screens at desktop/mobile sizes, WCAG A/AA rules with axe, uploads, approval/scheduling, and direct live-service rejection. Install the matching browser with `npx playwright install chromium`.

Run checks sequentially: Next.js regenerates route definitions and `next-env.d.ts`. The typecheck script runs `next typegen` first and works from a clean source archive. See `docs/gap-audit.md` and `docs/validation.md` for the current audit and observed results.

PGlite backup restoration verifies the database mechanism locally. It does not prove a restore of your deployed Supabase database or Storage bucket. Follow `docs/operations.md` for a staging restore drill and provider pilot before launch.

## References

- [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
- [Supabase server-side authentication](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Meta Instagram API collection](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api)
- [Trigger.dev tasks](https://trigger.dev/docs/tasks/overview)
