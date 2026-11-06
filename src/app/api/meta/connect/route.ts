import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { actor, sameOrigin } from "@/lib/auth";
import { required } from "@/lib/supabase";
import { AppError } from "@/lib/domain";
import { errorResponse } from "@/lib/http";
import { META_SCOPES } from "@/lib/meta-scopes";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await actor();
    if (user.role !== "admin")
      throw new AppError("Only admins can connect accounts.", 403);
    const state = randomBytes(32).toString("hex");
    (await cookies()).set("meta_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });
    const url = new URL(
      `https://www.facebook.com/${required("META_GRAPH_VERSION")}/dialog/oauth`,
    );
    url.search = new URLSearchParams({
      client_id: required("META_APP_ID"),
      redirect_uri: `${required("APP_URL")}/api/meta/callback`,
      state,
      scope: META_SCOPES.join(","),
      response_type: "code",
    }).toString();
    return NextResponse.json({ url: url.toString() });
  } catch (e) {
    return errorResponse(e);
  }
}
