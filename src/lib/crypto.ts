import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { required } from "./supabase";
function key() {
  const k = required("TOKEN_ENCRYPTION_KEY");
  if (!/^[a-f0-9]{64}$/i.test(k))
    throw new Error("TOKEN_ENCRYPTION_KEY must be 64 hex characters.");
  return Buffer.from(k, "hex");
}
export function encrypt(value: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv),
    content = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), content]
    .map((b) => b.toString("base64url"))
    .join(".");
}
export function decrypt(value: string) {
  const [iv, tag, data] = value
    .split(".")
    .map((v) => Buffer.from(v, "base64url"));
  const cipher = createDecipheriv("aes-256-gcm", key(), iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString("utf8");
}
