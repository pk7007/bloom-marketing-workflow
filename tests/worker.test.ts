import { beforeEach, describe, it, expect, vi } from "vitest";
import { emptyState, type State, type Publication } from "../src/lib/domain";
const mocks = vi.hoisted(() => ({
  state: null as unknown as State,
  graph: vi.fn(),
  token: vi.fn(),
  failPublishedOnce: false,
}));
vi.mock("@trigger.dev/sdk", () => ({ schedules: { task: (x: unknown) => x } }));
vi.mock("../src/lib/store", () => ({
  loadState: async () => ({ state: structuredClone(mocks.state), revision: 0 }),
  mutate: async (fn: (s: State) => State | void) => {
    const copy = structuredClone(mocks.state);
    const next = fn(copy) || copy;
    if (
      mocks.failPublishedOnce &&
      next.publications.some((p) => p.status === "published")
    ) {
      mocks.failPublishedOnce = false;
      throw new Error("Database temporarily unavailable");
    }
    mocks.state = next;
    return next;
  },
}));
vi.mock("../src/lib/supabase", () => ({
  adminDb: () => ({
    storage: {
      from: () => ({
        createSignedUrl: async () => ({
          data: { signedUrl: "https://storage.test/image.jpg" },
          error: null,
        }),
      }),
    },
  }),
  assertLive: () => {},
  required: () => "",
  workspaceId: () => "",
}));
vi.mock("../src/lib/meta", () => ({
  graph: mocks.graph,
  tokenFor: mocks.token,
  MetaError: class extends Error {
    constructor(
      message: string,
      public code: number,
      public transient = false,
      public unsupportedMetric = false,
    ) {
      super(message);
    }
  },
}));
import {
  dispatch,
  collectPostMetrics,
  sweepPublications,
} from "../src/jobs/publishing";
import { MetaError } from "../src/lib/meta";
beforeEach(() => {
  mocks.failPublishedOnce = false;
  mocks.graph.mockReset();
  mocks.token.mockReset().mockResolvedValue("secret");
  const s = emptyState(),
    vid = crypto.randomUUID();
  s.connections = [
    {
      platform: "facebook",
      accountId: "123",
      name: "Brand",
      status: "connected",
    },
  ];
  s.contents = [
    {
      id: "c",
      title: "Hello",
      brief: "Hello",
      platform: "facebook",
      status: "approved",
      approvedVersion: vid,
      comments: [],
      createdAt: new Date().toISOString(),
      versions: [
        {
          id: vid,
          caption: "Hello",
          author: "Admin",
          createdAt: new Date().toISOString(),
          asset: {
            id: crypto.randomUUID(),
            path: "image.jpg",
            width: 1080,
            height: 1080,
            bytes: 100,
            mime: "image/jpeg",
          },
        },
      ],
    },
  ];
  s.publications = [
    {
      id: "p",
      contentId: "c",
      versionId: vid,
      platform: "facebook",
      scheduledAt: "2020-01-01T00:00:00Z",
      status: "scheduled",
      attempts: 0,
    },
  ];
  mocks.state = s;
});
describe("provider outcomes", () => {
  it("records a successful remote ID and never republishes on replay", async () => {
    mocks.graph.mockResolvedValue({ post_id: "123_456" });
    await dispatch("p");
    await dispatch("p");
    expect(mocks.graph).toHaveBeenCalledTimes(1);
    expect(mocks.state.publications[0].remoteId).toBe("123_456");
    expect(mocks.state.publications[0].status).toBe("published");
  });
  it("requires manual review after an uncertain network outcome", async () => {
    mocks.graph.mockRejectedValue(new Error("timeout"));
    await dispatch("p");
    expect(mocks.state.publications[0].status).toBe("manual_review");
    await dispatch("p");
    expect(mocks.graph).toHaveBeenCalledTimes(1);
  });
  it("retries explicit rate-limit rejection with bounded backoff", async () => {
    mocks.graph.mockRejectedValue(new MetaError("Rate limited", 4, true));
    await dispatch("p");
    expect(mocks.state.publications[0].status).toBe("scheduled");
    expect(
      new Date(mocks.state.publications[0].nextAttemptAt!).getTime(),
    ).toBeGreaterThan(Date.now());
    mocks.state.publications[0].attempts = 2;
    mocks.state.publications[0].nextAttemptAt = "2020-01-01T00:00:00Z";
    await dispatch("p");
    expect(mocks.state.publications[0].status).toBe("failed");
  });
  it("flags expired credentials for reconnection", async () => {
    mocks.graph.mockRejectedValue(new MetaError("Expired", 190));
    await dispatch("p");
    expect(mocks.state.connections[0].status).toBe("reconnect");
    expect(mocks.state.publications[0].status).toBe("failed");
  });
  it("rechecks approval before any network request", async () => {
    mocks.state.contents[0].approvedVersion = null;
    await dispatch("p");
    expect(mocks.graph).not.toHaveBeenCalled();
  });
  it("does not affect an independent successful publication", async () => {
    mocks.state.publications.push({
      ...mocks.state.publications[0],
      id: "other",
      platform: "instagram",
      status: "published",
      remoteId: "987",
    });
    mocks.graph.mockRejectedValue(new Error("timeout"));
    await dispatch("p");
    expect(mocks.state.publications[1].status).toBe("published");
  });
});

describe("publication fencing and recovery", () => {
  it("retains a known provider result after a transient database write failure", async () => {
    mocks.failPublishedOnce = true;
    mocks.graph.mockResolvedValue({ post_id: "123_456" });
    await dispatch("p");
    expect(mocks.graph).toHaveBeenCalledTimes(1);
    expect(mocks.state.publications[0].status).toBe("published");
    expect(mocks.state.publications[0].remoteId).toBe("123_456");
  });
  it("does not substitute a photo ID for a Facebook post ID", async () => {
    mocks.graph.mockResolvedValue({ id: "photo-only" });
    await dispatch("p");
    expect(mocks.state.publications[0].status).toBe("manual_review");
    expect(mocks.state.publications[0].remoteId).toBeUndefined();
  });
  it("prevents a late worker from overwriting a newer claim", async () => {
    mocks.graph.mockImplementation(async () => {
      mocks.state.publications[0].claimId = "new-owner";
      return { post_id: "123_456" };
    });
    await dispatch("p");
    expect(mocks.state.publications[0].claimId).toBe("new-owner");
    expect(mocks.state.publications[0].status).toBe("dispatching");
  });
  it("reuses the Instagram container after processing delay", async () => {
    mocks.state.contents[0].platform = "instagram";
    mocks.state.connections[0].platform = "instagram";
    mocks.state.publications[0].platform = "instagram";
    mocks.graph
      .mockResolvedValueOnce({ id: "987" })
      .mockResolvedValueOnce({ status_code: "IN_PROGRESS" });
    await dispatch("p");
    expect(mocks.state.publications[0].containerId).toBe("987");
    expect(mocks.state.publications[0].status).toBe("scheduled");
    mocks.state.publications[0].nextAttemptAt = "2020-01-01T00:00:00Z";
    mocks.graph
      .mockResolvedValueOnce({ status_code: "FINISHED" })
      .mockResolvedValueOnce({ id: "555" });
    await dispatch("p");
    expect(
      mocks.graph.mock.calls.filter((c) => c[0] === "123/media"),
    ).toHaveLength(1);
    expect(mocks.state.publications[0].status).toBe("published");
  });
  it("moves interrupted claims to investigation without publishing again", async () => {
    const p = mocks.state.publications[0];
    p.status = "dispatching";
    p.dispatchAt = "2020-01-01T00:00:00Z";
    p.claimId = "interrupted";
    await sweepPublications();
    expect(mocks.state.publications[0].status).toBe("manual_review");
    expect(mocks.graph).not.toHaveBeenCalled();
  });
});
describe("metric collection failures", () => {
  function published() {
    Object.assign(mocks.state.publications[0], {
      status: "published",
      remoteId: "123_456",
      publishedAt: new Date().toISOString(),
    });
  }
  it("records permission failures as errors, not fresh successful null metrics", async () => {
    published();
    mocks.graph.mockRejectedValue(new MetaError("Permission denied", 200));
    await expect(collectPostMetrics()).rejects.toThrow("collections failed");
    expect(
      mocks.state.metrics.every(
        (m) => m.status === "error" && m.value === null,
      ),
    ).toBe(true);
  });
  it("records explicit unsupported metrics separately and does not invent zero", async () => {
    published();
    mocks.graph.mockRejectedValue(
      new MetaError("Unsupported metric", 100, false, true),
    );
    await collectPostMetrics();
    expect(
      mocks.state.metrics.every(
        (m) => m.status === "unsupported" && m.value === null,
      ),
    ).toBe(true);
  });
  it("deduplicates same-day snapshots and preserves a measured zero", async () => {
    published();
    mocks.graph.mockResolvedValue({ data: [{ values: [{ value: 0 }] }] });
    await collectPostMetrics();
    await collectPostMetrics();
    expect(mocks.state.metrics).toHaveLength(2);
    expect(
      mocks.state.metrics.every(
        (m) => m.status === "available" && m.value === 0,
      ),
    ).toBe(true);
  });
  it("marks an empty provider result pending instead of unsupported", async () => {
    published();
    mocks.graph.mockResolvedValue({ data: [] });
    await collectPostMetrics();
    expect(mocks.state.metrics.every((m) => m.status === "pending")).toBe(true);
  });
});
