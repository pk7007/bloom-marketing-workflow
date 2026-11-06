import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { adminDb, required, workspaceId, assertLive } from "./supabase";
import { AppError, type Actor } from "./domain";
export async function sessionClient() {
  assertLive();
  const store = await cookies();
  return createServerClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (values) =>
          values.forEach(({ name, value, options }) =>
            store.set(name, value, options),
          ),
      },
    },
  );
}
export async function actor(): Promise<Actor> {
  const db = await sessionClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user)
    throw new AppError("Sign in to your invited account.", 401);
  const { data, error: err } = await adminDb()
    .from("memberships")
    .select("role")
    .eq("workspace_id", workspaceId())
    .eq("user_id", user.id)
    .single();
  if (err || !data)
    throw new AppError("You have not been invited to this workspace.", 403);
  return { id: user.id, email: user.email || user.id, role: data.role };
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(required("APP_URL")).origin)
    throw new AppError("Request origin rejected.", 403);
}
