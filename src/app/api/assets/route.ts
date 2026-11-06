import { NextResponse } from "next/server";
import { actor } from "@/lib/auth";
import { adminDb, workspaceId } from "@/lib/supabase";
import { errorResponse } from "@/lib/http";
export async function GET() {
  try {
    await actor();
    const db = adminDb();
    const { data, error } = await db
      .from("assets")
      .select("id,path")
      .eq("workspace_id", workspaceId());
    if (error) throw error;
    const urls: Record<string, string> = {};
    for (const a of data || []) {
      const { data: s } = await db.storage
        .from("marketing-images")
        .createSignedUrl(a.path, 3600);
      if (s) urls[a.id] = s.signedUrl;
    }
    return NextResponse.json({ urls });
  } catch (e) {
    return errorResponse(e);
  }
}
