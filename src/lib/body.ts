import { AppError } from "./domain";
export async function boundedFormData(request: Request, limit: number) {
  const type = request.headers.get("content-type") || "";
  if (!type.toLowerCase().startsWith("multipart/form-data;"))
    throw new AppError("Upload a multipart image form.");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("Choose an image.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new AppError(
          "Upload body exceeds the supported image limit.",
          413,
        );
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return await new Response(Buffer.concat(chunks), {
      headers: { "Content-Type": type },
    }).formData();
  } catch {
    throw new AppError("The upload form could not be decoded.");
  }
}
