# Operations and recovery

## Before release

- Complete the Meta integration proof. Confirm privacy and data deletion URLs describe the actual business process.
- Disable public Supabase signups; verify invited-user onboarding, own-password setup, and removed-member access in staging.
- Verify environment-specific OAuth URLs and APP_URL. Use separate staging/production projects and encryption keys.
- Deploy the Trigger.dev jobs and confirm their schedules are active. Configure administrator failure notifications in Trigger.dev and Sentry. Configure billing alerts in all paid providers.
- Confirm `DEMO_MODE=false` and `ALLOW_DEMO_DEPLOYMENT=false`. LocalStorage demo contents are not imported into live data.
- Verify an uninvited account cannot retrieve state, assets, or social credentials. Run local tests and a staging acceptance pass.

## Backup drill

1. Export the staging PostgreSQL database through Supabase's supported backup mechanism. Back up Storage objects separately; database backups do not necessarily contain uploaded file bytes.
2. Retain TOKEN_ENCRYPTION_KEY in the team's secret manager separately from the database backup. Never include it in a downloadable project archive.
3. Restore into a new, isolated Supabase project. Keep Trigger.dev workers disabled and Meta credentials disconnected while verifying the restore.
4. Check workspace membership, content versions, approval records, publication statuses, audit history, asset metadata, and image object bytes. Check RLS using a member and nonmember.
5. Reconnect staging Meta accounts and verify encrypted-token handling. Reconcile any restored `dispatching` or `manual_review` posts against the platform before enabling scheduling.
6. Record recovery time, missing data, and corrective work. Only enable workers after overdue schedules have been reviewed or cancelled.

## Publishing incidents

- **Manual review:** Inspect the original account. Verify post checks owner, caption, dispatch-time window, and remote-ID uniqueness. If no post exists, investigate provider logs and container state. After at least ten minutes, an admin can record detailed notes and explicitly confirm absence using Record confirmed absence. That records the decision and permits manual scheduling; it never republishes automatically. Do not reset database statuses or retry blindly.
- **Failed:** Read the connection health and Meta error code. Repair permissions, image requirements, or token access. Review content before creating a new publication attempt.
- **Overdue:** Check Trigger.dev deployment, environment, schedule activity, database connectivity, and concurrent job executions.
- **Metrics unavailable:** Verify the current Graph version, metric support, media eligibility, and insights permissions. Do not substitute zero for unsupported data.
- **AI cap reached:** Review recorded request usage and the provider bill before changing the environment cap. Failed calls remain counted.

## Retention and scale

Workflow state is a single versioned JSONB document per workspace. Keep to the intended small-team use. Monitor document size and write contention. Implement a reviewed retention/export policy or normalized storage migration before substantial growth. Files are immutable and may remain after an unused draft/upload; perform an administrator-reviewed orphan cleanup rather than deleting assets referenced by published versions.

For a read-only orphan report, run `node --env-file=.env.local scripts/orphan-report.mjs` against an explicitly configured staging/live workspace. It compares Storage objects, asset metadata, and references in every historical content version, and marks candidates older than seven days. It deletes nothing. Review backups and all references before manual cleanup.

## Upgrade and verification

Pause workers and apply migration 003 before upgrading app and worker versions together. New databases need all three migrations in order. The new commit function rechecks membership, and connection/member operations are transactional. No cloud migrations were run in this audit.

Old content-command clients must refresh: edit, submit, review, and schedule now require expectedVersion. Existing documents require no bulk rewrite. Legacy interrupted claims are retired to investigation; publication account IDs are adopted/preserved before reconnecting.

Run type generation, builds, and end-to-end server startup sequentially in one checkout. They regenerate next-env.d.ts and route types. End-to-end tests use a separate output directory and port to avoid attaching to a live server.

Configure notification routing, spending limits, actual restore drills, and provider credentials in the services themselves. Local tests are not proof of live account access. An invite email and a membership write cannot be one cross-service transaction: if email succeeds but membership creation fails, an admin must repair membership before onboarding can complete. The invitee has no workspace access without that membership.

## Rollback

Pause scheduled workers before an application/database rollback. Restore the matching application version and compatible migrations. Inspect outstanding publications before resuming jobs. Changing TOKEN_ENCRYPTION_KEY without migrating ciphertext requires reconnecting accounts.
