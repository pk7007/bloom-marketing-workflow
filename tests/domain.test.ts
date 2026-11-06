import { describe, it, expect } from "vitest";
import {
  applyCommand as rawApplyCommand,
  claimPublication,
  emptyState,
  validateAsset,
  type Actor,
  type State,
  type Asset,
} from "../src/lib/domain";
import { localDateTime, zonedToUtc } from "../src/lib/time";
const admin: Actor = { id: "a", email: "admin@test.com", role: "admin" },
  creator: Actor = { id: "c", email: "creator@test.com", role: "creator" };
const now = new Date("2026-11-05T10:00:00Z"),
  later = "2026-11-05T12:00:00Z";
const asset: Asset = {
  id: crypto.randomUUID(),
  path: "workspace/image.jpg",
  width: 1080,
  height: 1080,
  bytes: 10000,
  mime: "image/jpeg",
};
function draft(platform: "instagram" | "facebook" = "instagram") {
  let s = emptyState();
  s.connections = [
    { platform, accountId: "123", name: "Brand", status: "connected" },
  ];
  s = applyCommand(
    s,
    {
      type: "create",
      title: "Weekend",
      brief: "A thoughtful weekend post",
      platform,
      caption: "Hello, weekend.",
      asset,
    },
    creator,
    now,
  );
  return s;
}
function approved() {
  let s = draft();
  const id = s.contents[0].id;
  s = applyCommand(s, { type: "submit", id }, creator, now);
  return applyCommand(
    s,
    { type: "review", id, decision: "approve", comment: "" },
    admin,
    now,
  );
}
function scheduled() {
  const s = approved();
  return applyCommand(
    s,
    { type: "schedule", id: s.contents[0].id, scheduledAt: later },
    admin,
    now,
  );
}
describe("approval and permissions", () => {
  it("rejects creator approval and scheduling even with valid content", () => {
    let s = draft();
    const id = s.contents[0].id;
    s = applyCommand(s, { type: "submit", id }, creator, now);
    expect(() =>
      applyCommand(
        s,
        { type: "review", id, decision: "approve", comment: "" },
        creator,
        now,
      ),
    ).toThrow("Creators");
    const a = approved();
    expect(() =>
      applyCommand(
        a,
        { type: "schedule", id: a.contents[0].id, scheduledAt: later },
        creator,
        now,
      ),
    ).toThrow("Creators");
  });
  it("binds approval to a version and cancels its schedule after editing", () => {
    const before = scheduled(),
      id = before.contents[0].id;
    const next = applyCommand(
      before,
      { type: "edit", id, caption: "Updated", asset },
      creator,
      now,
    );
    expect(next.contents[0].versions).toHaveLength(2);
    expect(next.contents[0].approvedVersion).toBeNull();
    expect(next.publications[0].status).toBe("cancelled");
    expect(before.contents[0].status).toBe("approved");
  });
  it("invalidates approval when only the image changes", () => {
    const s = approved(),
      c = s.contents[0];
    const n = applyCommand(
      s,
      {
        type: "edit",
        id: c.id,
        caption: c.versions[0].caption,
        asset: { ...asset, id: crypto.randomUUID() },
      },
      creator,
      now,
    );
    expect(n.contents[0].status).toBe("draft");
  });
  it("preserves approval for unchanged content and moving a schedule", () => {
    const s = scheduled(),
      c = s.contents[0];
    let n = applyCommand(
      s,
      { type: "edit", id: c.id, caption: c.versions[0].caption, asset },
      creator,
      now,
    );
    n = applyCommand(
      n,
      {
        type: "reschedule",
        id: n.publications[0].id,
        scheduledAt: "2026-11-06T12:00:00Z",
      },
      admin,
      now,
    );
    expect(n.contents[0].approvedVersion).toBe(c.approvedVersion);
    expect(n.contents[0].versions).toHaveLength(1);
  });
  it("requires feedback when requesting changes", () => {
    let s = draft();
    const id = s.contents[0].id;
    s = applyCommand(s, { type: "submit", id }, creator, now);
    expect(() =>
      applyCommand(
        s,
        { type: "review", id, decision: "changes", comment: "" },
        admin,
        now,
      ),
    ).toThrow("Explain");
  });
  it("restricts settings, disconnect, cancellation, and reconciliation", () => {
    const s = scheduled();
    for (const c of [
      { type: "brand", brand: s.brand },
      { type: "disconnect", platform: "instagram" },
      { type: "cancel", id: s.publications[0].id },
      { type: "reconcile", id: s.publications[0].id, remoteId: "123" },
    ] as const)
      expect(() => applyCommand(s, c, creator, now)).toThrow();
  });
});
describe("publishing state machine", () => {
  it("does not claim early and allows only one claim", () => {
    const s = scheduled(),
      p = s.publications[0];
    expect(claimPublication(s, p.id, now)).toBe(false);
    expect(claimPublication(s, p.id, new Date(later))).toBe(true);
    expect(claimPublication(s, p.id, new Date(later))).toBe(false);
  });
  it("does not dispatch cancelled content", () => {
    let s = scheduled();
    const id = s.publications[0].id;
    s = applyCommand(s, { type: "cancel", id }, admin, now);
    expect(claimPublication(s, id, new Date(later))).toBe(false);
  });
  it("blocks edits and cancellation after dispatch begins", () => {
    const s = scheduled(),
      c = s.contents[0],
      id = s.publications[0].id;
    claimPublication(s, id, new Date(later));
    expect(() => applyCommand(s, { type: "cancel", id }, admin, now)).toThrow(
      "Dispatch",
    );
    expect(() =>
      applyCommand(
        s,
        { type: "edit", id: c.id, caption: "Edited", asset },
        creator,
        now,
      ),
    ).toThrow("progress");
  });
  it("rechecks version approval just before dispatch", () => {
    const s = scheduled();
    s.contents[0].approvedVersion = crypto.randomUUID();
    expect(claimPublication(s, s.publications[0].id, new Date(later))).toBe(
      false,
    );
    expect(s.publications[0].status).toBe("cancelled");
  });
  it("marks revoked connections as failed", () => {
    const s = scheduled();
    s.connections[0].status = "reconnect";
    expect(claimPublication(s, s.publications[0].id, new Date(later))).toBe(
      false,
    );
    expect(s.publications[0].status).toBe("failed");
  });
  it("prevents duplicate and already-published version schedules", () => {
    const s = scheduled();
    expect(() =>
      applyCommand(
        s,
        { type: "schedule", id: s.contents[0].id, scheduledAt: later },
        admin,
        now,
      ),
    ).toThrow("already");
    s.publications[0].status = "published";
    expect(() =>
      applyCommand(
        s,
        { type: "schedule", id: s.contents[0].id, scheduledAt: later },
        admin,
        now,
      ),
    ).toThrow("already");
  });
  it("keeps other platform publications independent", () => {
    const s = scheduled();
    s.publications.push({
      ...s.publications[0],
      id: crypto.randomUUID(),
      platform: "facebook",
      status: "published",
    });
    s.publications[0].status = "failed";
    expect(s.publications[1].status).toBe("published");
  });
});
describe("images and time", () => {
  it("enforces separate platform image rules", () => {
    expect(() => validateAsset({ ...asset, width: 2000 }, "instagram")).toThrow(
      "Instagram",
    );
    expect(() =>
      validateAsset({ ...asset, width: 100, height: 100 }, "facebook"),
    ).toThrow("Facebook");
    expect(() => validateAsset(null, "instagram")).toThrow("Upload");
  });
  it("converts Kolkata wall time to UTC and back", () => {
    expect(zonedToUtc("2026-11-06T18:30", "Asia/Kolkata")).toBe(
      "2026-11-06T13:00:00.000Z",
    );
    expect(localDateTime("2026-11-06T13:00:00Z", "Asia/Kolkata")).toBe(
      "2026-11-06T18:30",
    );
  });
  it("rejects nonexistent DST local times and schedules in the past", () => {
    expect(() => zonedToUtc("2026-03-08T02:30", "America/New_York")).toThrow(
      "does not exist",
    );
    const s = approved();
    expect(() =>
      applyCommand(
        s,
        {
          type: "schedule",
          id: s.contents[0].id,
          scheduledAt: now.toISOString(),
        },
        admin,
        now,
      ),
    ).toThrow("future");
  });
});

function applyCommand(state: State, command: any, actor: Actor, now?: Date) {
  const c = { ...command };
  if (
    ["edit", "submit", "review", "schedule"].includes(c.type) &&
    !("expectedVersion" in c)
  )
    c.expectedVersion = state.contents
      .find((x) => x.id === c.id)
      ?.versions.at(-1)?.id;
  return rawApplyCommand(state, c, actor, now);
}
