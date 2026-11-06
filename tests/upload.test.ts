import { beforeEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn(),
  insert: vi.fn(),
  normalize: vi.fn(),
}));
vi.mock("../src/lib/auth", () => ({
  actor: async () => ({ id: "member", email: "m@test.com", role: "creator" }),
  sameOrigin: () => {},
}));
vi.mock("../src/lib/images", () => ({ normalizeImage: mocks.normalize }));
vi.mock("../src/lib/supabase", () => ({
  workspaceId: () => "workspace",
  adminDb: () => ({
    storage: {
      from: () => ({
        upload: mocks.upload,
        remove: mocks.remove,
        createSignedUrl: async () => ({
          data: { signedUrl: "https://example.test/signed" },
        }),
      }),
    },
    from: () => ({ insert: mocks.insert }),
  }),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
import { POST } from "../src/app/api/upload/route";
beforeEach(() => {
  mocks.upload.mockReset().mockResolvedValue({ error: null });
  mocks.remove.mockReset().mockResolvedValue({ error: null });
  mocks.insert
    .mockReset()
    .mockResolvedValue({ error: { message: "Metadata failed" } });
  mocks.normalize
    .mockReset()
    .mockResolvedValue({
      data: Buffer.from("jpeg"),
      info: { width: 1000, height: 1000 },
    });
});
function request() {
  const form = new FormData();
  form.append(
    "file",
    new File(["source"], "source.png", { type: "image/png" }),
  );
  return new Request("http://localhost/api/upload", {
    method: "POST",
    body: form,
  });
}
it("removes the newly uploaded object when metadata recording fails", async () => {
  const result = await POST(request());
  expect(result.status).toBe(503);
  expect((await result.json()).error).toContain("removed");
  expect(mocks.upload).toHaveBeenCalledTimes(1);
  expect(mocks.remove).toHaveBeenCalledWith([
    expect.stringMatching(/^workspace\/[0-9a-f-]+\.jpg$/),
  ]);
});
it("reports failed compensation instead of claiming the upload was cleaned up", async () => {
  mocks.remove.mockResolvedValue({ error: { message: "Storage unavailable" } });
  const result = await POST(request());
  expect(result.status).toBe(503);
  expect((await result.json()).error).toContain("administrator attention");
});
