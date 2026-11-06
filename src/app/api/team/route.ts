import { NextResponse } from "next/server";
import { z } from "zod";
import { actor, sameOrigin } from "@/lib/auth";
import { adminDb, workspaceId, required } from "@/lib/supabase";
import { AppError } from "@/lib/domain";
import { errorResponse } from "@/lib/http";
export async function GET() {
  try {
    const a = await actor();
    if (a.role !== "admin") throw new AppError("Admin required.", 403);
    const { data, error } = await adminDb()
      .from("memberships")
      .select("user_id,email,role")
      .eq("workspace_id", workspaceId());
    if (error) throw error;
    return NextResponse.json({ members: data });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const a = await actor();
    if (a.role !== "admin") throw new AppError("Admin required.", 403);
    const input = z
      .discriminatedUnion("action", [
        z.object({
          action: z.literal("invite"),
          email: z.string().email(),
          role: z.enum(["creator", "approver", "admin"]),
        }),
        z.object({
          action: z.literal("role"),
          userId: z.string().uuid(),
          role: z.enum(["creator", "approver", "admin"]),
        }),
        z.object({ action: z.literal("remove"), userId: z.string().uuid() }),
      ])
      .parse(await request.json());
    const db = adminDb();
    if (input.action === "invite") {
      const { data, error } = await db.auth.admin.inviteUserByEmail(
        input.email,
        { redirectTo: `${required("APP_URL")}/auth/callback` },
      );
      if (error || !data.user)
        throw new AppError(
          "Invitation could not be sent. Check SMTP and whether this email already exists.",
        );
      const result = await db.rpc("add_workspace_member", {
        p_workspace: workspaceId(),
        p_actor: a.id,
        p_target: data.user.id,
        p_email: input.email,
        p_role: input.role,
      });
      if (result.error)
        throw new AppError(
          "Invitation sent, but membership creation failed. Admin must repair membership.",
          503,
        );
    } else {
      if (input.userId === a.id)
        throw new AppError("You cannot remove or change your own admin role.");
      const { error } = await db.rpc("change_workspace_member", {
        p_workspace: workspaceId(),
        p_actor: a.id,
        p_target: input.userId,
        p_role: input.action === "role" ? input.role : null,
      });
      if (error)
        throw new AppError(
          "Membership change could not be committed.",
          error.code === "42501" ? 403 : 409,
        );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
