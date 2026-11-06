import { afterEach, describe, it, expect, vi } from "vitest";
import { encrypt, decrypt } from "../src/lib/crypto";
import { sameOrigin } from "../src/lib/auth";
import { graph, MetaError } from "../src/lib/meta";
afterEach(() => vi.unstubAllGlobals());
describe("credential and request boundaries", () => {
  it("encrypts tokens with randomized authenticated encryption", () => {
    process.env.TOKEN_ENCRYPTION_KEY = "ab".repeat(32);
    const a = encrypt("private-token"),
      b = encrypt("private-token");
    expect(a).not.toContain("private-token");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("private-token");
    const parts = a.split(".");
    parts[2] = Buffer.from("tampered").toString("base64url");
    expect(() => decrypt(parts.join("."))).toThrow();
  });
  it("rejects cross-site and missing origins on mutations", () => {
    process.env.APP_URL = "http://localhost:3000";
    expect(() =>
      sameOrigin(
        new Request("http://localhost:3000/api/commands", {
          headers: { origin: "https://evil.test" },
        }),
      ),
    ).toThrow("origin");
    expect(() =>
      sameOrigin(new Request("http://localhost:3000/api/commands")),
    ).toThrow("origin");
    expect(() =>
      sameOrigin(
        new Request("http://localhost:3000/api/commands", {
          headers: { origin: "http://localhost:3000" },
        }),
      ),
    ).not.toThrow();
  });
  it("classifies server errors after a write as uncertain, without blind retry", async () => {
    process.env.META_GRAPH_VERSION = "v99.0";
    process.env.META_APP_SECRET = "test-secret";
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ error: { code: 2, is_transient: true } }),
            { status: 500 },
          ),
        ),
    );
    await expect(
      graph("123/photos", "token", "POST", { caption: "Hello" }),
    ).rejects.toThrow("Ambiguous");
  });
  it("recognizes an explicit rate-limit rejection", async () => {
    process.env.META_GRAPH_VERSION = "v99.0";
    process.env.META_APP_SECRET = "test-secret";
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ error: { code: 4, is_transient: true } }),
            { status: 400 },
          ),
        ),
    );
    try {
      await graph("123/photos", "token", "POST");
      throw new Error("Expected rejection");
    } catch (e) {
      expect(e).toBeInstanceOf(MetaError);
      expect((e as MetaError).transient).toBe(true);
    }
  });
  it("keeps bearer credentials out of request URLs", async () => {
    process.env.META_GRAPH_VERSION = "v99.0";
    process.env.META_APP_SECRET = "test-secret";
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: "123" })));
    vi.stubGlobal("fetch", fetcher);
    await graph("123", "private-token");
    expect(String(fetcher.mock.calls[0][0])).not.toContain("private-token");
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe(
      "Bearer private-token",
    );
  });
});
