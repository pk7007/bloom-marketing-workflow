import { createClient } from "@supabase/supabase-js";
const {
  NEXT_PUBLIC_SUPABASE_URL: url,
  SUPABASE_SERVICE_ROLE_KEY: key,
  ADMIN_EMAIL: email,
} = process.env;
if (!url || !key || !email)
  throw new Error("Set Supabase URL, service role key, and ADMIN_EMAIL.");
const db = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 });
if (error) throw error;
const user = data.users.find(
  (u) => u.email?.toLowerCase() === email.toLowerCase(),
);
if (!user)
  throw new Error("Create the first admin in Supabase Auth before bootstrap.");
const existing = await db
  .from("memberships")
  .select("workspace_id")
  .eq("user_id", user.id);
if (existing.data?.length)
  throw new Error(
    "Admin already belongs to a workspace. Reuse its ID instead of bootstrapping again.",
  );
const { data: w, error: we } = await db
  .from("workspaces")
  .insert({ name: "Marketing workspace" })
  .select("id")
  .single();
if (we) throw we;
const state = {
  brand: {
    name: "Your brand",
    description: "",
    audience: "",
    tone: "Warm, clear, and helpful",
    facts: "",
    prohibited: "",
    timezone: "Asia/Kolkata",
  },
  contents: [],
  publications: [],
  connections: [],
  metrics: [],
  usage: [],
  approvals: [],
  audit: [],
};
for (const [table, record] of [
  ["workspace_state", { workspace_id: w.id, document: state }],
  [
    "memberships",
    { workspace_id: w.id, user_id: user.id, email, role: "admin" },
  ],
]) {
  const { error } = await db.from(table).insert(record);
  if (error) throw error;
}
console.log(`Workspace created. Set WORKSPACE_ID=${w.id}`);
