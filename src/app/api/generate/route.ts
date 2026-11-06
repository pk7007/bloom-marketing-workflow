import { NextResponse } from "next/server";
import { actor, sameOrigin } from "@/lib/auth";
import { generate, generationSchema } from "@/lib/ai";
import { errorResponse } from "@/lib/http";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await actor();
    return NextResponse.json(
      await generate(generationSchema.parse(await request.json()), user),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
