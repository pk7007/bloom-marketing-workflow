import { describe, it, expect } from "vitest";
import {
  applyCommand,
  commandSchema,
  claimPublication,
  emptyState,
  type Actor,
  type Asset,
} from "../src/lib/domain";
import { zonedToUtc } from "../src/lib/time";
import { assembleCaption } from "../src/lib/limits";
import { assertLive } from "../src/lib/supabase";
import { redactTelemetry } from "../src/lib/telemetry";
const actor: Actor = {
    id: crypto.randomUUID(),
    email: "admin@test.com",
    role: "admin",
  },
  now = new Date("2026-11-06T10:00:00Z");
const asset: Asset = {
  id: crypto.randomUUID(),
  path: "a.jpg",
  mime: "image/jpeg",
  width: 1080,
  height: 1080,
  bytes: 100,
};
function fixture() {
  let s = emptyState();
  s.connections = [
    {
      platform: "facebook",
      name: "One",
      accountId: "123",
      status: "connected",
    },
  ];
  s = applyCommand(
    s,
    {
      type: "create",
      title: "A",
      brief: "A test brief",
      platform: "facebook",
      asset,
      caption: "Original",
    },
    actor,
    now,
  );
  return s;
}
function approved() {
  let s = fixture();
  const c = s.contents[0],
    expectedVersion = c.versions[0].id;
  s = applyCommand(
    s,
    { type: "submit", id: c.id, expectedVersion },
    actor,
    now,
  );
  return applyCommand(
    s,
    {
      type: "review",
      id: c.id,
      expectedVersion,
      decision: "approve",
      comment: "",
    },
    actor,
    now,
  );
}
function scheduled() {
  const s = approved(),
    c = s.contents[0];
  return applyCommand(
    s,
    {
      type: "schedule",
      id: c.id,
      expectedVersion: c.approvedVersion!,
      scheduledAt: "2026-11-06T11:00:00Z",
    },
    actor,
    now,
  );
}
describe("stale intent and recovery regressions", () => {
  it("requires a version on edit/review/submit/schedule requests", () => {
    for (const type of ["edit", "review", "submit", "schedule"])
      expect(
        commandSchema.safeParse({
          type,
          id: "c",
          caption: "test",
          asset: null,
          decision: "approve",
          comment: "",
          scheduledAt: "2026-11-07T10:00:00Z",
        }).success,
      ).toBe(false);
  });
  it("rejects an old editor instead of overwriting a new version", () => {
    let s = fixture(),
      c = s.contents[0],
      v = c.versions[0].id;
    s = applyCommand(
      s,
      { type: "edit", id: c.id, expectedVersion: v, caption: "Newer", asset },
      actor,
      now,
    );
    expect(() =>
      applyCommand(
        s,
        { type: "edit", id: c.id, expectedVersion: v, caption: "Stale", asset },
        actor,
        now,
      ),
    ).toThrow("changed");
    expect(s.contents[0].versions.at(-1)?.caption).toBe("Newer");
  });
  it("rejects a reviewer who inspected an earlier version", () => {
    let s = fixture(),
      c = s.contents[0],
      v = c.versions[0].id;
    s = applyCommand(
      s,
      {
        type: "edit",
        id: c.id,
        expectedVersion: v,
        caption: "Newer",
        asset,
        submitForReview: true,
      },
      actor,
      now,
    );
    expect(() =>
      applyCommand(
        s,
        {
          type: "review",
          id: c.id,
          expectedVersion: v,
          decision: "approve",
          comment: "",
        },
        actor,
        now,
      ),
    ).toThrow("changed");
  });
  it("saves and submits the edited version in one state transition", () => {
    const s = fixture(),
      c = s.contents[0];
    const next = applyCommand(
      s,
      {
        type: "edit",
        id: c.id,
        expectedVersion: c.versions[0].id,
        caption: "Revised",
        asset,
        submitForReview: true,
      },
      actor,
      now,
    );
    expect(next.contents[0].status).toBe("in_review");
    expect(next.contents[0].versions.at(-1)?.caption).toBe("Revised");
    expect(s.contents[0].versions).toHaveLength(1);
  });
  it("does not save an edit when its atomic submission is invalid", () => {
    const s = fixture(),
      c = s.contents[0];
    expect(() =>
      applyCommand(
        s,
        {
          type: "edit",
          id: c.id,
          expectedVersion: c.versions[0].id,
          caption: "",
          asset: null,
          submitForReview: true,
        },
        actor,
        now,
      ),
    ).toThrow();
    expect(s.contents[0].versions).toHaveLength(1);
  });
  it("blocks editing and scheduling around an unresolved outcome", () => {
    const s = scheduled(),
      c = s.contents[0];
    s.publications[0].status = "manual_review";
    s.publications[0].versionId = "older";
    expect(() =>
      applyCommand(
        s,
        {
          type: "edit",
          id: c.id,
          expectedVersion: c.approvedVersion!,
          caption: "Another",
          asset,
        },
        actor,
        now,
      ),
    ).toThrow("unresolved");
    expect(() =>
      applyCommand(
        s,
        {
          type: "schedule",
          id: c.id,
          expectedVersion: c.approvedVersion!,
          scheduledAt: "2026-11-07T11:00:00Z",
        },
        actor,
        now,
      ),
    ).toThrow("Resolve");
  });
  it("requires an admin and a cooling period to confirm absence", () => {
    const s = scheduled(),
      p = s.publications[0];
    p.status = "manual_review";
    p.dispatchAt = "2026-11-06T09:59:00Z";
    const cmd = {
      type: "resolve_absent",
      id: p.id,
      confirmedAbsent: true,
      comment: "Inspected account and provider logs; no post exists.",
    } as const;
    expect(() =>
      applyCommand(s, cmd, { ...actor, role: "approver" }, now),
    ).toThrow("admin");
    expect(() => applyCommand(s, cmd, actor, now)).toThrow("ten minutes");
    p.dispatchAt = "2026-11-06T09:40:00Z";
    const next = applyCommand(s, cmd, actor, now);
    expect(next.publications[0].status).toBe("failed");
    expect(next.publications[0].reconciliation).toContain(actor.email);
    expect(next.publications).toHaveLength(1);
  });
  it("does not publish a schedule to a newly connected account", () => {
    const s = scheduled();
    s.connections[0].accountId = "456";
    expect(
      claimPublication(
        s,
        s.publications[0].id,
        new Date("2026-11-06T12:00:00Z"),
      ),
    ).toBe(false);
    expect(s.publications[0].status).toBe("cancelled");
  });
  it("rejects expired connections before preparation", () => {
    const s = scheduled();
    s.connections[0].expiresAt = now.toISOString();
    expect(
      claimPublication(
        s,
        s.publications[0].id,
        new Date("2026-11-06T12:00:00Z"),
      ),
    ).toBe(false);
    expect(s.connections[0].status).toBe("reconnect");
  });
  it("keeps immutable publication account IDs after disconnecting", () => {
    const s = scheduled();
    const next = applyCommand(
      s,
      { type: "disconnect", platform: "facebook" },
      actor,
      now,
    );
    expect(next.publications[0].accountId).toBe("123");
    expect(next.publications[0].status).toBe("cancelled");
  });
});
describe("input and boundary regressions", () => {
  it("rejects ambiguous fall-back times, invalid dates, and DST gaps", () => {
    expect(() => zonedToUtc("2026-11-01T01:30", "America/New_York")).toThrow(
      "twice",
    );
    expect(() => zonedToUtc("2026-02-30T10:00", "Asia/Kolkata")).toThrow(
      "valid",
    );
    expect(() => zonedToUtc("2026-03-08T02:30", "America/New_York")).toThrow(
      "does not exist",
    );
  });
  it("supports half-hour timezone conversion", () => {
    expect(zonedToUtc("2026-11-06T18:30", "Asia/Kolkata")).toBe(
      "2026-11-06T13:00:00.000Z",
    );
  });
  it("uses the exact caption formatting shown in the editor", () => {
    expect(assembleCaption(" Hello ", ["#Brand"])).toBe("Hello\n\n#Brand");
    expect(assembleCaption("Hello", [])).toBe("Hello");
  });
  it("blocks live services even if demo credentials happen to exist", () => {
    const previous = process.env.DEMO_MODE;
    process.env.DEMO_MODE = "true";
    expect(() => assertLive()).toThrow("disabled");
    if (previous === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = previous;
  });
  it("redacts OAuth and provider credentials from telemetry", () => {
    const cleaned = redactTelemetry({
      url: "https://graph.test/?client_secret=secret&access_token=token",
      headers: { Authorization: "Bearer secret" },
      text: "Bearer unknown-secret",
    });
    expect(JSON.stringify(cleaned)).not.toContain("=secret");
    expect(cleaned.headers.Authorization).toBe("[REDACTED]");
    expect(cleaned.text).toBe("Bearer [REDACTED]");
  });
});
