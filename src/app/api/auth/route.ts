import { NextResponse } from "next/server";
import { z } from "zod";
import { sameOrigin, sessionClient } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { AppError } from "@/lib/domain";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { email, password, logout } = z
      .object({
        email: z.string().email().optional(),
        password: z.string().min(8).optional(),
        logout: z.boolean().optional(),
      })
      .parse(await request.json());
    const db = await sessionClient();
    if (logout) {
      const { error } = await db.auth.signOut();
      if (error)
        throw new AppError("Sign-out could not be confirmed. Retry.", 503);
      return NextResponse.json({ ok: true });
    }
    if (!email || !password)
      throw new AppError("Enter your email and password.");
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw new AppError("Email or password is incorrect.", 401);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
