import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "./domain";
import * as Sentry from "@sentry/nextjs";
export function errorResponse(e: unknown) {
  if (e instanceof ZodError)
    return NextResponse.json(
      { error: e.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  if (e instanceof AppError)
    return NextResponse.json({ error: e.message }, { status: e.status });
  Sentry.captureException(e);
  return NextResponse.json(
    {
      error:
        "The request could not be completed. Check service configuration and server logs.",
    },
    { status: 500 },
  );
}
