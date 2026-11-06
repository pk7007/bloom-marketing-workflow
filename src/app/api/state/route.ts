import { NextResponse } from "next/server";
import { actor } from "@/lib/auth";
import { loadState } from "@/lib/store";
import { errorResponse } from "@/lib/http";
import { isDemo } from "@/lib/supabase";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    if (isDemo()) return NextResponse.json({ mode: "demo" });
    const user = await actor();
    const { state } = await loadState();
    return NextResponse.json(
      { mode: "live", state, user },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
