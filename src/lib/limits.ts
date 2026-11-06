// Leaves room for multipart headers below Vercel's 4.5 MB request limit.
export const MAX_SOURCE_BYTES = 4_000_000;
export const MAX_JPEG_BYTES = 8 * 1024 * 1024;
export const SOURCE_LIMIT_LABEL = "4 MB";
export const MAX_CAPTION_LENGTH = 2200;
export function assembleCaption(caption: string, hashtags: string[]) {
  return `${caption.trim()}${hashtags.length ? "\n\n" + hashtags.join(" ") : ""}`;
}
