import { describe, it, expect, vi, beforeEach } from "vitest";
import { emptyState, type Actor, type State } from "../src/lib/domain";
const mocks = vi.hoisted(() => ({
  user: { id: "c", email: "creator@test.com", role: "creator" } as Actor,
  state: null as unknown as State,
}));
vi.mock("../src/lib/auth", () => ({
  actor: async () => mocks.user,
  sameOrigin: () => {},
}));
vi.mock("../src/lib/store", () => ({
  mutate: async (fn: (s: State) => State | void) => {
    const next = fn(mocks.state);
    if (next) mocks.state = next;
    return mocks.state;
  },
}));
vi.mock("../src/lib/supabase", () => ({
  adminDb: vi.fn(),
  workspaceId: () => "",
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
import { POST } from "../src/app/api/commands/route";
beforeEach(() => {
  mocks.state = emptyState();
  mocks.user.role = "creator";
  const v = crypto.randomUUID();
  mocks.state.contents.push({
    id: "c",
    title: "Title",
    brief: "Brief",
    platform: "facebook",
    status: "in_review",
    approvedVersion: null,
    comments: [],
    createdAt: new Date().toISOString(),
    versions: [
      {
        id: v,
        caption: "Hello",
        asset: {
          id: crypto.randomUUID(),
          path: "a.jpg",
          width: 1080,
          height: 1080,
          bytes: 100,
          mime: "image/jpeg",
        },
        createdAt: new Date().toISOString(),
        author: "creator",
      },
    ],
  });
});
describe("direct API permissions", () => {
  it("rejects a creator approving through a direct POST", async () => {
    const r = await POST(
      new Request("http://localhost/api/commands", {
        method: "POST",
        body: JSON.stringify({
          type: "review",
          expectedVersion: mocks.state.contents[0].versions[0].id,
          id: "c",
          decision: "approve",
          comment: "",
        }),
      }),
    );
    expect(r.status).toBe(403);
    expect(mocks.state.contents[0].approvedVersion).toBeNull();
  });
  it("rejects a creator scheduling a valid approved version", async () => {
    mocks.state.contents[0].status = "approved";
    mocks.state.contents[0].approvedVersion =
      mocks.state.contents[0].versions[0].id;
    const r = await POST(
      new Request("http://localhost/api/commands", {
        method: "POST",
        body: JSON.stringify({
          type: "schedule",
          expectedVersion: mocks.state.contents[0].versions[0].id,
          id: "c",
          scheduledAt: new Date(Date.now() + 3600000).toISOString(),
        }),
      }),
    );
    expect(r.status).toBe(403);
  });
  it("returns field validation errors without mutating state", async () => {
    const r = await POST(
      new Request("http://localhost/api/commands", {
        method: "POST",
        body: JSON.stringify({ type: "create", platform: "tiktok" }),
      }),
    );
    expect(r.status).toBe(400);
    expect(mocks.state.contents).toHaveLength(1);
  });
});
