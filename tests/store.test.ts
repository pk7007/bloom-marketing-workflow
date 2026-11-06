import { beforeEach, describe, it, expect, vi } from "vitest";
import { emptyState, type State, type Actor } from "../src/lib/domain";
const mocks = vi.hoisted(() => ({
  row: null as unknown as { document: State; revision: number },
  rpc: vi.fn(),
  denied: false,
}));
vi.mock("../src/lib/supabase", () => ({
  workspaceId: () => "workspace",
  adminDb: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: structuredClone(mocks.row),
            error: null,
          }),
        }),
      }),
    }),
    rpc: mocks.rpc,
  }),
}));
import { mutate } from "../src/lib/store";
beforeEach(() => {
  mocks.denied = false;
  mocks.row = { document: emptyState(), revision: 0 };
  mocks.rpc.mockReset().mockImplementation(async (_name: string, args: any) => {
    if (mocks.denied) return { data: null, error: { code: "42501" } };
    if (args.p_revision !== mocks.row.revision)
      return { data: false, error: null };
    mocks.row = {
      document: structuredClone(args.p_document),
      revision: mocks.row.revision + 1,
    };
    return { data: true, error: null };
  });
});
describe("retried compare-and-swap mutations", () => {
  it("preserves independent concurrent changes after a revision conflict", async () => {
    await Promise.all([
      mutate((s) => {
        s.brand.name = "Name";
      }),
      mutate((s) => {
        s.brand.tone = "Tone";
      }),
    ]);
    expect(mocks.row.document.brand.name).toBe("Name");
    expect(mocks.row.document.brand.tone).toBe("Tone");
    expect(mocks.row.revision).toBe(2);
    expect(mocks.rpc.mock.calls.length).toBeGreaterThan(2);
  });
  it("allows only one concurrent quota reservation at the cap", async () => {
    const reserve = () =>
      mutate((s) => {
        if (s.usage.length >= 1) throw new Error("limit");
        s.usage.push({
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          status: "reserved",
          model: "test",
          tokens: null,
          promptVersion: "v1",
        });
      });
    const results = await Promise.allSettled([reserve(), reserve()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(mocks.row.document.usage).toHaveLength(1);
  });
  it("passes the authenticated role and disconnect intent to the commit", async () => {
    const a: Actor = { id: "admin-id", email: "a@test.com", role: "admin" };
    await mutate(() => {}, a, "facebook");
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({
      p_actor: a.id,
      p_role: "admin",
      p_disconnect: "facebook",
    });
  });
  it("surfaces revoked membership as forbidden and leaves state unchanged", async () => {
    mocks.denied = true;
    await expect(
      mutate(
        (s) => {
          s.brand.name = "Unauthorized";
        },
        { id: "removed", email: "r@test.com", role: "admin" },
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.row.document.brand.name).toBe("Your brand");
  });
});
