import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { actor } from "@/lib/auth";
import { adminDb, required, workspaceId } from "@/lib/supabase";
import { encrypt } from "@/lib/crypto";
import { graph } from "@/lib/meta";
import { AppError } from "@/lib/domain";
import { META_SCOPES } from "@/lib/meta-scopes";
export async function GET(request: Request) {
  const origin = required("APP_URL");
  try {
    const user = await actor();
    if (user.role !== "admin") throw new AppError("Admin required.");
    const url = new URL(request.url),
      store = await cookies(),
      expected = store.get("meta_state")?.value || "",
      actual = url.searchParams.get("state") || "";
    store.delete("meta_state");
    if (
      !expected ||
      expected.length !== actual.length ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
    )
      throw new AppError("Invalid OAuth state.");
    const code = url.searchParams.get("code");
    if (!code) throw new AppError("Connection was cancelled.");
    const redirect_uri = `${origin}/api/meta/callback`;
    const exchange = new URL(
      `https://graph.facebook.com/${required("META_GRAPH_VERSION")}/oauth/access_token`,
    );
    exchange.search = new URLSearchParams({
      client_id: required("META_APP_ID"),
      client_secret: required("META_APP_SECRET"),
      redirect_uri,
      code,
    }).toString();
    const response = await fetch(exchange, {
        signal: AbortSignal.timeout(20000),
        cache: "no-store",
      }),
      short = await response.json();
    if (!response.ok || !short.access_token)
      throw new AppError("Token exchange failed.");
    exchange.search = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: required("META_APP_ID"),
      client_secret: required("META_APP_SECRET"),
      fb_exchange_token: short.access_token,
    }).toString();
    const lr = await fetch(exchange, {
        signal: AbortSignal.timeout(20000),
        cache: "no-store",
      }),
      long = await lr.json();
    if (!lr.ok || !long.access_token)
      throw new AppError("Long-lived token exchange failed.");
    const permissions = await graph("me/permissions", long.access_token);
    const granted = new Set(
      (permissions.data || [])
        .filter((p: { status: string }) => p.status === "granted")
        .map((p: { permission: string }) => p.permission),
    );
    if (META_SCOPES.some((scope) => !granted.has(scope)))
      throw new AppError("Required Meta permissions were not granted.");
    const pages = await graph("me/accounts", long.access_token, "GET", {
      fields: "id,name,access_token,instagram_business_account{id,username}",
      limit: "100",
    });
    const target = process.env.META_PAGE_ID;
    const page = target
      ? pages.data?.find((p: any) => p.id === target)
      : pages.data?.length === 1
        ? pages.data[0]
        : null;
    if (!page?.access_token || !page.instagram_business_account?.id)
      throw new AppError(
        "Set META_PAGE_ID when multiple Pages exist, and link a professional Instagram account.",
      );
    const db = adminDb(),
      expiresAt = long.expires_in
        ? new Date(Date.now() + long.expires_in * 1000).toISOString()
        : undefined;
    const connections = [
      {
        platform: "facebook",
        accountId: page.id,
        name: page.name,
        status: "connected",
        expiresAt,
      },
      {
        platform: "instagram",
        accountId: page.instagram_business_account.id,
        name: page.instagram_business_account.username || "Instagram",
        status: "connected",
        expiresAt,
      },
    ];
    const { error } = await db.rpc("connect_workspace", {
      p_workspace: workspaceId(),
      p_actor: user.id,
      p_connections: connections,
      p_secrets: ["facebook", "instagram"].map((platform) => ({
        platform,
        ciphertext: encrypt(page.access_token),
      })),
    });
    if (error)
      throw new AppError(
        "Could not atomically update Meta connections.",
        error.code === "42501" ? 403 : 409,
      );
    return NextResponse.redirect(`${origin}/?connected=true`);
  } catch {
    return NextResponse.redirect(`${origin}/?connection=failed`);
  }
}
