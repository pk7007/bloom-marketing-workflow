import { createHmac } from "node:crypto";
import { adminDb, required, workspaceId } from "./supabase";
import { decrypt } from "./crypto";
import { AppError, type Platform } from "./domain";
import { loadState } from "./store";
export class MetaError extends Error {
  constructor(
    message: string,
    public code: number,
    public transient = false,
    public unsupportedMetric = false,
  ) {
    super(message);
  }
}
export async function graph(
  path: string,
  token: string,
  method: "GET" | "POST" = "GET",
  params: Record<string, string> = {},
): Promise<any> {
  const version = required("META_GRAPH_VERSION");
  if (!/^v\d+\.\d+$/.test(version))
    throw new AppError("Configure a valid Meta Graph version.", 503);
  if (!/^(?:me|[0-9_]+)(?:\/[a-z_]+)?$/.test(path))
    throw new Error("Invalid Graph path");
  const url = new URL(`https://graph.facebook.com/${version}/${path}`);
  const data = new URLSearchParams({
    ...params,
    appsecret_proof: createHmac("sha256", required("META_APP_SECRET"))
      .update(token)
      .digest("hex"),
  });
  if (method === "GET") data.forEach((v, k) => url.searchParams.set(k, v));
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(method === "POST"
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : {}),
    },
    body: method === "POST" ? data : undefined,
    signal: AbortSignal.timeout(25000),
    cache: "no-store",
  });
  const json = await response.json();
  if (!response.ok || json.error) {
    const e = json.error || {};
    const rateLimited = [4, 17, 32, 613, 429].includes(
      e.code || response.status,
    );
    if (
      method === "POST" &&
      (response.status >= 500 || (e.is_transient && !rateLimited))
    )
      throw new Error("Ambiguous provider write failure");
    throw new MetaError(
      `Meta rejected the request (code ${e.code || response.status}).`,
      e.code || response.status,
      rateLimited,
      method === "GET" &&
        path.endsWith("/insights") &&
        !!params.metric &&
        e.code === 100 &&
        /metric/i.test(e.message || "") &&
        /invalid|unsupported|deprecated|must be one of/i.test(e.message || ""),
    );
  }
  return json;
}
export async function tokenFor(platform: Platform) {
  const { data, error } = await adminDb()
    .from("social_secrets")
    .select("ciphertext")
    .eq("workspace_id", workspaceId())
    .eq("platform", platform)
    .single();
  if (error || !data) throw new MetaError("Reconnect the social account.", 190);
  return decrypt(data.ciphertext);
}
export async function verifyRemotePost(
  publicationId: string,
  remoteId: string,
) {
  const { state } = await loadState(),
    p = state.publications.find((x) => x.id === publicationId);
  if (!p || p.status !== "manual_review")
    throw new AppError("Publication is not awaiting reconciliation.");
  const conn = state.connections.find((c) => c.platform === p.platform);
  if (!conn || (p.accountId && p.accountId !== conn.accountId))
    throw new AppError(
      "Reconnect the original publishing account before verifying.",
    );
  const token = await tokenFor(p.platform),
    fields =
      p.platform === "instagram"
        ? "id,owner,caption,timestamp"
        : "id,from,message,created_time";
  const post = await graph(remoteId, token, "GET", { fields });
  const owner = p.platform === "instagram" ? post.owner?.id : post.from?.id;
  const content = state.contents
    .find((c) => c.id === p.contentId)
    ?.versions.find((v) => v.id === p.versionId)?.caption;
  if (owner !== conn.accountId || (post.caption || post.message) !== content)
    throw new AppError(
      "The post owner or caption does not match this publication.",
    );
  const created = Date.parse(
      p.platform === "instagram" ? post.timestamp : post.created_time,
    ),
    dispatched = Date.parse(p.dispatchAt || "");
  if (
    !Number.isFinite(created) ||
    !Number.isFinite(dispatched) ||
    created < dispatched - 120000 ||
    created > dispatched + 10 * 60000
  )
    throw new AppError(
      "This post timestamp does not match the attempted publication.",
    );
}
