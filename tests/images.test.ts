import { it, expect } from "vitest";
import sharp from "sharp";
import { normalizeImage } from "../src/lib/images";
import { MAX_SOURCE_BYTES } from "../src/lib/limits";
it("rejects oversized source files before decoding", async () => {
  await expect(
    normalizeImage(Buffer.alloc(MAX_SOURCE_BYTES + 1)),
  ).rejects.toThrow("4 MB");
});
it("rejects forged or corrupted image content", async () => {
  await expect(
    normalizeImage(Buffer.from("<svg>not a JPEG</svg>")),
  ).rejects.toThrow("image");
});
it("normalizes real PNG data, strips metadata, and respects the width cap", async () => {
  const input = await sharp({
    create: {
      width: 2000,
      height: 1800,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer();
  const { data, info } = await normalizeImage(input);
  expect(info.width).toBe(1440);
  expect(info.format).toBe("jpeg");
  expect((await sharp(data).metadata()).exif).toBeUndefined();
  const { data: raw } = await sharp(data)
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect(raw[0]).toBeGreaterThan(245);
});
