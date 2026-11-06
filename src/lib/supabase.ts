import { createClient } from "@supabase/supabase-js";
import { AppError } from "./domain";
export function assertLive() {
  if (process.env.DEMO_MODE === "true")
    throw new AppError(
      "Live services are disabled while demo mode is enabled.",
      503,
    );
}
export function required(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not configured.`);
  return v;
}
export function adminDb() {
  return createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
export function isDemo() {
  return (
    process.env.DEMO_MODE === "true" &&
    (process.env.NODE_ENV !== "production" ||
      process.env.ALLOW_DEMO_DEPLOYMENT === "true")
  );
}
export function workspaceId() {
  return required("WORKSPACE_ID");
}
