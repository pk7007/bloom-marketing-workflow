import { adminDb, workspaceId } from "./supabase";
import { AppError, type State, type Actor } from "./domain";
export async function loadState() {
  const { data, error } = await adminDb()
    .from("workspace_state")
    .select("document,revision")
    .eq("workspace_id", workspaceId())
    .single();
  if (error || !data)
    throw new AppError(
      "Database is not initialized. Follow the setup guide.",
      503,
    );
  return { state: data.document as State, revision: data.revision as number };
}
// Compare-and-swap makes each edit, approval, quota reservation, and job claim atomic.
// Never perform external side effects inside a retried mutation.
export async function mutate(
  fn: (state: State) => State | void,
  actor?: Actor,
  disconnect?: string,
): Promise<State> {
  for (let i = 0; i < 8; i++) {
    const { state, revision } = await loadState();
    const next = fn(state) || state;
    const { data, error } = await adminDb().rpc("save_workspace_state", {
      p_workspace: workspaceId(),
      p_revision: revision,
      p_document: next,
      ...(actor ? { p_actor: actor.id, p_role: actor.role } : {}),
      ...(disconnect ? { p_disconnect: disconnect } : {}),
    });
    if (error)
      throw new AppError(
        error.code === "42501"
          ? "Your workspace access changed. Sign in again."
          : "Could not save workspace changes.",
        error.code === "42501" ? 403 : 503,
      );
    if (data) return next;
  }
  throw new AppError("Someone else updated the workspace. Please retry.", 409);
}
