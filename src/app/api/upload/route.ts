import { NextResponse } from "next/server";
import { normalizeImage } from "@/lib/images";
import { MAX_SOURCE_BYTES, SOURCE_LIMIT_LABEL } from "@/lib/limits";
import { boundedFormData } from "@/lib/body";
import { actor, sameOrigin } from "@/lib/auth";
import { adminDb, workspaceId } from "@/lib/supabase";
import { errorResponse } from "@/lib/http";
import { AppError } from "@/lib/domain";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await actor();
    if (
      Number(request.headers.get("content-length") || 0) >
      MAX_SOURCE_BYTES + 65536
    )
      throw new AppError(`Upload an image smaller than ${SOURCE_LIMIT_LABEL}.`);
    const file = (await boundedFormData(request, MAX_SOURCE_BYTES + 65536)).get(
      "file",
    );
    if (!(file instanceof File) || file.size > MAX_SOURCE_BYTES)
      throw new AppError(`Choose an image under ${SOURCE_LIMIT_LABEL}.`);
    const input = Buffer.from(await file.arrayBuffer());
    const { data, info } = await normalizeImage(input);
    const id = crypto.randomUUID(),
      path = `${workspaceId()}/${id}.jpg`,
      db = adminDb();
    const { error } = await db.storage
      .from("marketing-images")
      .upload(path, data, { contentType: "image/jpeg", upsert: false });
    if (error) throw new AppError("Image upload failed.", 503);
    const asset = {
      id,
      path,
      width: info.width,
      height: info.height,
      bytes: data.length,
      mime: "image/jpeg",
    };
    const saved = await db
      .from("assets")
      .insert({ ...asset, workspace_id: workspaceId() });
    if (saved.error) {
      const cleanup = await db.storage.from("marketing-images").remove([path]);
      throw new AppError(
        cleanup.error
          ? "Image metadata failed and cleanup needs administrator attention."
          : "Could not record image metadata. The uploaded object was removed.",
        503,
      );
    }
    const { data: signed } = await db.storage
      .from("marketing-images")
      .createSignedUrl(path, 3600);
    return NextResponse.json({ asset: { ...asset, url: signed?.signedUrl } });
  } catch (e) {
    return errorResponse(e);
  }
}
