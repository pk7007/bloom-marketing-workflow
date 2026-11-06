import { beforeEach, afterEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  graph: vi.fn(),
  rpc: vi.fn(),
  expected: "valid-state",
  fetch: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => ({ value: mocks.expected }),
    delete: vi.fn(),
  }),
}));
vi.mock("../src/lib/auth", () => ({
  actor: async () => ({ id: "admin", email: "admin@test.com", role: "admin" }),
}));
vi.mock("../src/lib/supabase", () => ({
  required: (k: string) =>
    ({
      APP_URL: "http://localhost:3000",
      META_GRAPH_VERSION: "v99.0",
      META_APP_ID: "app",
      META_APP_SECRET: "secret",
    })[k] || "value",
  workspaceId: () => "workspace",
  adminDb: () => ({ rpc: mocks.rpc }),
}));
vi.mock("../src/lib/crypto", () => ({ encrypt: () => "encrypted" }));
vi.mock("../src/lib/meta", () => ({ graph: mocks.graph }));
import { GET } from "../src/app/api/meta/callback/route";
import { META_SCOPES } from "../src/lib/meta-scopes";
beforeEach(() => {
  mocks.graph.mockReset();
  mocks.rpc.mockReset().mockResolvedValue({ error: null });
  mocks.fetch
    .mockReset()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "short" })),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "long", expires_in: 3600 })),
    );
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.expected = "valid-state";
  delete process.env.META_PAGE_ID;
});
afterEach(() => vi.unstubAllGlobals());
it("rejects an invalid OAuth state before provider calls", async () => {
  const r = await GET(
    new Request(
      "http://localhost:3000/api/meta/callback?state=wrong&code=test",
    ),
  );
  expect(r.headers.get("location")).toContain("connection=failed");
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("does not mark a connection ready when required permissions were declined", async () => {
  mocks.graph.mockResolvedValue({
    data: [{ permission: "pages_show_list", status: "granted" }],
  });
  const r = await GET(
    new Request(
      "http://localhost:3000/api/meta/callback?state=valid-state&code=test",
    ),
  );
  expect(r.headers.get("location")).toContain("connection=failed");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("commits connection state and credentials with one RPC after permission validation", async () => {
  mocks.graph
    .mockResolvedValueOnce({
      data: META_SCOPES.map((permission) => ({
        permission,
        status: "granted",
      })),
    })
    .mockResolvedValueOnce({
      data: [
        {
          id: "123",
          name: "Page",
          access_token: "page-token",
          instagram_business_account: { id: "456", username: "Brand" },
        },
      ],
    });
  const r = await GET(
    new Request(
      "http://localhost:3000/api/meta/callback?state=valid-state&code=test",
    ),
  );
  expect(r.headers.get("location")).toContain("connected=true");
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(mocks.rpc.mock.calls[0][0]).toBe("connect_workspace");
  expect(mocks.rpc.mock.calls[0][1].p_secrets).toHaveLength(2);
  expect(JSON.stringify(mocks.rpc.mock.calls[0])).not.toContain("page-token");
});
