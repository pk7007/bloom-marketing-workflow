import { NextResponse } from "next/server";
import { z } from "zod";
import { actor, sameOrigin, sessionClient } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { AppError } from "@/lib/domain";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await actor();
    const { password } = z
      .object({ password: z.string().min(12).max(128) })
      .parse(await request.json());
    const { error } = await (
      await sessionClient()
    ).auth.updateUser({ password });
    if (error) throw new AppError("Unable to update password.");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
