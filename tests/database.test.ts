import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { emptyState } from "../src/lib/domain";
let db: PGlite;
const w1 = "11111111-1111-4111-8111-111111111111",
  w2 = "22222222-2222-4222-8222-222222222222",
  u1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
  );
  for (const name of [
    "001_foundation.sql",
    "002_reporting_views.sql",
    "003_atomic_security.sql",
  ])
    await db.exec(
      await readFile(
        new URL(`../supabase/migrations/${name}`, import.meta.url),
        "utf8",
      ),
    );
  await db.query("insert into auth.users values($1)", [u1]);
  await db.query("insert into workspaces(id,name) values($1,$2),($3,$4)", [
    w1,
    "One",
    w2,
    "Two",
  ]);
  await db.query(
    "insert into memberships values($1,$2,'admin@example.com','admin')",
    [w1, u1],
  );
  await db.query(
    "insert into workspace_state(workspace_id,document) values($1,$2),($3,$4)",
    [w1, JSON.stringify(emptyState()), w2, JSON.stringify(emptyState())],
  );
}, 30000);
afterAll(async () => {
  await db.close();
});
describe("database migration, isolation, and durability", () => {
  it("rejects stale compare-and-swap revisions", async () => {
    await db.exec("set role service_role");
    let r = await db.query<{ ok: boolean }>(
      "select save_workspace_state($1,0,$2) as ok",
      [w1, JSON.stringify(emptyState())],
    );
    expect(r.rows[0].ok).toBe(true);
    r = await db.query("select save_workspace_state($1,0,$2) as ok", [
      w1,
      JSON.stringify(emptyState()),
    ]);
    expect(r.rows[0].ok).toBe(false);
    await db.exec("reset role");
  });
  it("shows members only their workspace and prevents direct mutation", async () => {
    await db.exec(`set role authenticated;set request.jwt.claim.sub='${u1}';`);
    const r = await db.query<{ workspace_id: string }>(
      "select workspace_id from workspace_state",
    );
    expect(r.rows.map((r) => r.workspace_id)).toEqual([w1]);
    await expect(
      db.exec("update workspace_state set revision=999"),
    ).rejects.toThrow();
    await expect(
      db.query("select save_workspace_state($1,1,$2)", [
        w1,
        JSON.stringify(emptyState()),
      ]),
    ).rejects.toThrow();
    await db.exec("reset role");
  });
  it("keeps credentials inaccessible and blocks nonmember state reads", async () => {
    await db.exec(
      `set role authenticated;set request.jwt.claim.sub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';`,
    );
    expect((await db.query("select * from workspace_state")).rows).toHaveLength(
      0,
    );
    expect((await db.query("select * from content_items")).rows).toHaveLength(
      0,
    );
    await expect(db.query("select * from social_secrets")).rejects.toThrow();
    await db.exec("reset role");
  });
  it("restores workspace records and credentials from a backup", async () => {
    const historical = emptyState();
    historical.contents.push({
      id: "restored-content",
      title: "Approved post",
      brief: "Test brief",
      platform: "facebook",
      status: "approved",
      approvedVersion: "version-2",
      comments: [],
      createdAt: "2026-11-01T10:00:00Z",
      versions: [
        {
          id: "version-1",
          caption: "Original",
          asset: null,
          author: "Creator",
          createdAt: "2026-11-01T10:00:00Z",
        },
        {
          id: "version-2",
          caption: "Approved revision",
          asset: null,
          author: "Creator",
          createdAt: "2026-11-01T11:00:00Z",
        },
      ],
    });
    historical.approvals.push({
      id: "approval",
      contentId: "restored-content",
      versionId: "version-2",
      decision: "approve",
      reviewer: "Reviewer",
      comment: "Reviewed",
      at: "2026-11-01T12:00:00Z",
    });
    historical.publications.push({
      id: "restored-publication",
      contentId: "restored-content",
      versionId: "version-2",
      platform: "facebook",
      scheduledAt: "2026-11-01T13:00:00Z",
      status: "published",
      attempts: 1,
      remoteId: "123_456",
    });
    historical.metrics.push({
      publicationId: "restored-publication",
      name: "reach",
      value: 10,
      status: "available",
      definition: "Test reach",
      at: "2026-11-02T00:00:00Z",
    });
    await db.query(
      "update workspace_state set document=$2 where workspace_id=$1",
      [w1, JSON.stringify(historical)],
    );
    await db.query(
      "insert into social_secrets(workspace_id,platform,ciphertext) values($1,'facebook','encrypted-test-ciphertext') on conflict(workspace_id,platform) do update set ciphertext=excluded.ciphertext",
      [w1],
    );
    const blob = await db.dumpDataDir("gzip");
    const restored = new PGlite({ loadDataDir: blob });
    expect(
      (await restored.query("select * from workspace_state")).rows,
    ).toHaveLength(2);
    expect(
      (await restored.query("select * from memberships")).rows,
    ).toHaveLength(1);
    const restoredState = (
      await restored.query<{ document: ReturnType<typeof emptyState> }>(
        "select document from workspace_state where workspace_id=$1",
        [w1],
      )
    ).rows[0].document;
    expect(restoredState.contents[0].versions).toHaveLength(2);
    expect(restoredState.approvals[0].versionId).toBe("version-2");
    expect(restoredState.publications[0].remoteId).toBe("123_456");
    expect(restoredState.metrics[0].value).toBe(10);
    expect(
      (
        await restored.query<{ ciphertext: string }>(
          "select ciphertext from social_secrets where workspace_id=$1 and platform='facebook'",
          [w1],
        )
      ).rows[0].ciphertext,
    ).toBe("encrypted-test-ciphertext");
    await restored.close();
  }, 30000);
  it("rejects removed members and stale roles at commit time", async () => {
    await db.exec("set role service_role");
    const { rows } = await db.query<{ revision: number }>(
      "select revision from workspace_state where workspace_id=$1",
      [w1],
    );
    await expect(
      db.query("select save_workspace_state($1,$2,$3,$4,$5)", [
        w1,
        rows[0].revision,
        JSON.stringify(emptyState()),
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        "admin",
      ]),
    ).rejects.toThrow("Membership");
    await db.query(
      "update memberships set role='creator' where workspace_id=$1 and user_id=$2",
      [w1, u1],
    );
    await expect(
      db.query("select save_workspace_state($1,$2,$3,$4,$5)", [
        w1,
        rows[0].revision,
        JSON.stringify(emptyState()),
        u1,
        "admin",
      ]),
    ).rejects.toThrow("Membership");
    await db.query(
      "update memberships set role='admin' where workspace_id=$1 and user_id=$2",
      [w1, u1],
    );
    await db.exec("reset role");
  });
  it("rolls connection state and credentials back together on failure", async () => {
    const before = (
      await db.query(
        "select document from workspace_state where workspace_id=$1",
        [w1],
      )
    ).rows;
    const connections = [
      {
        platform: "facebook",
        accountId: "123",
        name: "Page",
        status: "connected",
      },
      {
        platform: "instagram",
        accountId: "456",
        name: "IG",
        status: "connected",
      },
    ];
    const invalidSecrets = [
      { platform: "facebook", ciphertext: "first" },
      { platform: "facebook", ciphertext: "duplicate" },
    ];
    await db.exec("set role service_role");
    await expect(
      db.query("select connect_workspace($1,$2,$3,$4)", [
        w1,
        u1,
        JSON.stringify(connections),
        JSON.stringify(invalidSecrets),
      ]),
    ).rejects.toThrow();
    expect(
      (
        await db.query(
          "select document from workspace_state where workspace_id=$1",
          [w1],
        )
      ).rows,
    ).toEqual(before);
    expect(
      (
        await db.query<{ ciphertext: string }>(
          "select ciphertext from social_secrets where workspace_id=$1 and platform='facebook'",
          [w1],
        )
      ).rows[0].ciphertext,
    ).toBe("encrypted-test-ciphertext");
    await db.exec("reset role");
  });
  it("rejects reconnecting while a publication is dispatching", async () => {
    const s = emptyState();
    s.publications.push({
      id: "p",
      contentId: "c",
      versionId: "v",
      platform: "facebook",
      scheduledAt: new Date().toISOString(),
      status: "dispatching",
      attempts: 1,
    });
    await db.query(
      "update workspace_state set document=$2 where workspace_id=$1",
      [w1, JSON.stringify(s)],
    );
    await db.exec("set role service_role");
    await expect(
      db.query("select connect_workspace($1,$2,$3,$4)", [w1, u1, "[]", "[]"]),
    ).rejects.toThrow("Publishing");
    await db.exec("reset role");
  });
  it("cancels pending work on account changes and commits new credentials atomically", async () => {
    const s = emptyState();
    s.connections = [
      {
        platform: "facebook",
        accountId: "123",
        name: "Old",
        status: "connected",
      },
    ];
    s.publications.push({
      id: "p",
      contentId: "c",
      versionId: "v",
      platform: "facebook",
      scheduledAt: new Date().toISOString(),
      status: "scheduled",
      attempts: 0,
    });
    await db.query(
      "update workspace_state set document=$2 where workspace_id=$1",
      [w1, JSON.stringify(s)],
    );
    const connections = [
      {
        platform: "facebook",
        accountId: "999",
        name: "New",
        status: "connected",
      },
      {
        platform: "instagram",
        accountId: "456",
        name: "IG",
        status: "connected",
      },
    ];
    const secrets = connections.map((c) => ({
      platform: c.platform,
      ciphertext: "new-cipher",
    }));
    await db.exec("set role service_role");
    await db.query("select connect_workspace($1,$2,$3,$4)", [
      w1,
      u1,
      JSON.stringify(connections),
      JSON.stringify(secrets),
    ]);
    const result = (
      await db.query<{ document: ReturnType<typeof emptyState> }>(
        "select document from workspace_state where workspace_id=$1",
        [w1],
      )
    ).rows[0].document;
    expect(result.publications[0].status).toBe("cancelled");
    expect(result.publications[0].accountId).toBe("123");
    expect(
      (
        await db.query("select * from social_secrets where workspace_id=$1", [
          w1,
        ])
      ).rows,
    ).toHaveLength(2);
    await db.exec("reset role");
  });
  it("does not delete credentials when a disconnect loses its CAS race", async () => {
    const current = (
      await db.query<{ revision: number; document: unknown }>(
        "select revision,document from workspace_state where workspace_id=$1",
        [w1],
      )
    ).rows[0];
    await db.exec("set role service_role");
    const stale = await db.query<{ ok: boolean }>(
      "select save_workspace_state($1,$2,$3,$4,$5,$6) as ok",
      [w1, -1, JSON.stringify(current.document), u1, "admin", "facebook"],
    );
    expect(stale.rows[0].ok).toBe(false);
    expect(
      (
        await db.query(
          "select * from social_secrets where workspace_id=$1 and platform='facebook'",
          [w1],
        )
      ).rows,
    ).toHaveLength(1);
    await db.query("select save_workspace_state($1,$2,$3,$4,$5,$6)", [
      w1,
      current.revision,
      JSON.stringify(emptyState()),
      u1,
      "admin",
      "facebook",
    ]);
    expect(
      (
        await db.query(
          "select * from social_secrets where workspace_id=$1 and platform='facebook'",
          [w1],
        )
      ).rows,
    ).toHaveLength(0);
    await db.exec("reset role");
  });
  it("prevents a demoted administrator from removing the remaining admin", async () => {
    const u2 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    await db.query("insert into auth.users values($1)", [u2]);
    await db.query(
      "insert into memberships values($1,$2,'other@test.com','admin')",
      [w1, u2],
    );
    await db.exec("set role service_role");
    await db.query("select change_workspace_member($1,$2,$3,$4)", [
      w1,
      u1,
      u2,
      "creator",
    ]);
    await expect(
      db.query("select change_workspace_member($1,$2,$3,$4)", [
        w1,
        u2,
        u1,
        null,
      ]),
    ).rejects.toThrow("Admin");
    expect(
      (
        await db.query(
          "select * from memberships where workspace_id=$1 and role='admin'",
          [w1],
        )
      ).rows,
    ).toHaveLength(1);
    await db.exec("reset role");
  });
});
