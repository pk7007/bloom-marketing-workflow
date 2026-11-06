const sensitiveKey =
  /authorization|cookie|password|secret|token|api.?key|ciphertext/i;
export function redactTelemetry<T>(value: T): T {
  const secrets = [
    "OPENAI_API_KEY",
    "META_APP_SECRET",
    "SUPABASE_SERVICE_ROLE_KEY",
    "TOKEN_ENCRYPTION_KEY",
    "TRIGGER_SECRET_KEY",
  ]
    .map((k) => process.env[k])
    .filter((s): s is string => !!s && s.length > 8);
  const clean = (v: unknown): unknown => {
    if (typeof v === "string") {
      let text = v
        .replace(
          /((?:access_token|client_secret|token_hash|code|api_key)=)[^&\s"']+/gi,
          "$1[REDACTED]",
        )
        .replace(/Bearer\s+[^\s"']+/gi, "Bearer [REDACTED]");
      for (const secret of secrets)
        text = text.split(secret).join("[REDACTED]");
      return text;
    }
    if (Array.isArray(v)) return v.map(clean);
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.entries(v).map(([k, x]) => [
          k,
          sensitiveKey.test(k) ? "[REDACTED]" : clean(x),
        ]),
      );
    return v;
  };
  return clean(value) as T;
}
