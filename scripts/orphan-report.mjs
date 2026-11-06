// Read-only operational report. Never removes objects or credentials.
import { createClient } from "@supabase/supabase-js";
const env = process.env;
for (const key of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "WORKSPACE_ID",
])
  if (!env[key]) throw new Error(`Missing ${key}`);
if (env.DEMO_MODE === "true")
  throw new Error(
    "This report requires an explicitly configured live/staging environment.",
  );
const db = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const { data: row, error } = await db
  .from("workspace_state")
  .select("document")
  .eq("workspace_id", env.WORKSPACE_ID)
  .single();
if (error) throw new Error("Cannot read workspace.");
const referenced = new Set(
  row.document.contents.flatMap((c) =>
    c.versions.map((v) => v.asset?.path).filter(Boolean),
  ),
);
const { data: assets, error: assetError } = await db
  .from("assets")
  .select("id,path")
  .eq("workspace_id", env.WORKSPACE_ID);
if (assetError) throw new Error("Cannot read asset metadata.");
const tracked = new Set(assets.map((a) => a.path));
let offset = 0;
const candidates = [];
for (;;) {
  const { data: objects, error } = await db.storage
    .from("marketing-images")
    .list(env.WORKSPACE_ID, {
      limit: 100,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
  if (error) throw new Error("Cannot list image objects.");
  for (const object of objects) {
    const path = `${env.WORKSPACE_ID}/${object.name}`;
    if (!referenced.has(path))
      candidates.push({
        path,
        tracked: tracked.has(path),
        createdAt: object.created_at,
        oldEnough: Date.now() - Date.parse(object.created_at) > 7 * 86400000,
      });
  }
  if (objects.length < 100) break;
  offset += objects.length;
}
console.log(
  JSON.stringify(
    {
      mode: "read-only",
      referencedImages: referenced.size,
      reviewCandidates: candidates,
    },
    null,
    2,
  ),
);
console.log(
  "Review references and backups before any manual cleanup. This report has deleted nothing.",
);
