import { NextResponse } from "next/server";
import { sessionClient } from "@/lib/auth";
import { required } from "@/lib/supabase";
export async function GET(request: Request) {
  const u = new URL(request.url),
    db = await sessionClient();
  const token = u.searchParams.get("token_hash"),
    code = u.searchParams.get("code");
  if (token) {
    const { error } = await db.auth.verifyOtp({
      token_hash: token,
      type: "invite",
    });
    if (!error)
      return NextResponse.redirect(`${required("APP_URL")}/?setup=password`);
  }
  if (code) {
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(`${required("APP_URL")}/?setup=password`);
  }
  return NextResponse.redirect(`${required("APP_URL")}/?auth=failed`);
}
