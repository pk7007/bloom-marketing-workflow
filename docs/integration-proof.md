# Meta integration proof — deployment gate

Status: **Not run. Requires your accounts and credentials.**

Record date, operator, environment, Graph API version, Meta app mode/access level, Facebook Page ID, linked Instagram account ID, granted scopes, and token expiration without recording tokens or secrets.

1. Connect the Page and Instagram account through the app. Confirm both display the intended names.
2. Upload a business-approved JPEG. Generate or write platform-specific captions. Submit and approve their exact versions.
3. Schedule one explicitly approved pilot post per platform. Verify actual posts and record remote IDs, expected/actual times, and screenshots.
4. Wait for a metrics run. Record at least one real metric per platform, its definition, the exact endpoint/fields used, and collection timestamp. Update collector names if the chosen API version no longer supports the initial metrics.
5. Revoke test access. Confirm the app requires reconnection and does not claim success or publish repeatedly.
6. Record any review, business verification, Page authorization, or permission work required for production.

Do not release until publishing and a supported metric are proven for both accounts. Missing or unavailable metrics must remain visibly unavailable.

Also verify declined permissions leave prior connections unchanged; a timed-out publish is investigated without blind retry; switching accounts cancels old pending schedules; permission failures become collection errors; a supported metric returns an actual value; signed images survive ingestion; and the actual invite email/password/membership flow succeeds. These checks require real service accounts and remain unverified locally.
