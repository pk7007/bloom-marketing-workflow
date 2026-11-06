import sharp from "sharp";
import { AppError } from "./domain";
import { MAX_SOURCE_BYTES, MAX_JPEG_BYTES, SOURCE_LIMIT_LABEL } from "./limits";
export async function normalizeImage(input: Buffer) {
  if (!input.length || input.length > MAX_SOURCE_BYTES)
    throw new AppError(`Choose an image under ${SOURCE_LIMIT_LABEL}.`);
  try {
    const meta = await sharp(input, {
      limitInputPixels: 30_000_000,
      animated: false,
    }).metadata();
    if (
      !["jpeg", "png", "webp"].includes(meta.format || "") ||
      (meta.pages || 1) > 1
    )
      throw new AppError("Use a single-frame JPEG, PNG, or WebP image.");
    const result = await sharp(input, { limitInputPixels: 30_000_000 })
      .rotate()
      .resize({ width: 1440, withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 90 })
      .toBuffer({ resolveWithObject: true });
    if (result.data.length > MAX_JPEG_BYTES)
      throw new AppError(
        "The processed image is too large. Use a smaller source image.",
      );
    return result;
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(
      "This image cannot be decoded safely. Choose another JPEG, PNG, or WebP image.",
    );
  }
}
