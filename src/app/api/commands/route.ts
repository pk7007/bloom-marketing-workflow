import { NextResponse } from "next/server";
import { actor, sameOrigin } from "@/lib/auth";
import {
  applyCommand,
  commandSchema,
  AppError,
  canApprove,
} from "@/lib/domain";
import { mutate } from "@/lib/store";
import { errorResponse } from "@/lib/http";
import { adminDb, workspaceId } from "@/lib/supabase";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await actor();
    const c = commandSchema.parse(await request.json());
    if ("asset" in c && c.asset) {
      const { data } = await adminDb()
        .from("assets")
        .select("*")
        .eq("workspace_id", workspaceId())
        .eq("id", c.asset.id)
        .single();
      if (!data)
        throw new AppError("Choose an image uploaded to this workspace.");
      c.asset = {
        id: data.id,
        path: data.path,
        width: data.width,
        height: data.height,
        bytes: data.bytes,
        mime: data.mime,
      };
    }
    if (c.type === "reconcile") {
      if (!canApprove(user.role))
        throw new AppError("An approver or admin is required.", 403);
      const { verifyRemotePost } = await import("@/lib/meta");
      await verifyRemotePost(c.id, c.remoteId);
    }
    const state = await mutate(
      (s) => applyCommand(s, c, user),
      user,
      c.type === "disconnect" ? c.platform : undefined,
    );
    return NextResponse.json({ state });
  } catch (e) {
    return errorResponse(e);
  }
}
