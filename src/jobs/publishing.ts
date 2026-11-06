import { schedules } from "@trigger.dev/sdk";
import { mutate, loadState } from "../lib/store";
import {
  claimPublication,
  validateAsset,
  type Publication,
  type Metric,
} from "../lib/domain";
import { adminDb, required, assertLive } from "../lib/supabase";
import { graph, MetaError, tokenFor } from "../lib/meta";

async function patch(
  id: string,
  claimId: string,
  fields: Partial<Publication>,
) {
  let saved = false;
  await mutate((s) => {
    saved = false;
    const p = s.publications.find((p) => p.id === id);
    if (p && p.status === "dispatching" && p.claimId === claimId) {
      Object.assign(p, fields);
      saved = true;
    }
  });
  return saved;
}
export async function dispatch(id: string) {
  assertLive();
  let claimed = false;
  await mutate((s) => {
    claimed = claimPublication(s, id);
  });
  if (!claimed) return;
  const initial = (await loadState()).state.publications.find(
    (p) => p.id === id,
  )!;
  const claimId = initial.claimId!;
  let publishAttempted = false,
    knownRemoteId: string | undefined;
  const ownsClaim = async () => {
    const p = (await loadState()).state.publications.find((p) => p.id === id);
    return p?.status === "dispatching" && p.claimId === claimId;
  };
  try {
    const { state } = await loadState(),
      p = state.publications.find((x) => x.id === id)!,
      item = state.contents.find((x) => x.id === p.contentId)!,
      v = item.versions.find((x) => x.id === p.versionId)!,
      conn = state.connections.find((x) => x.platform === p.platform)!;
    validateAsset(v.asset, p.platform);
    const token = await tokenFor(p.platform);
    const { data, error } = await adminDb()
      .storage.from("marketing-images")
      .createSignedUrl(v.asset!.path, 3600);
    if (error || !data) throw new MetaError("Image is unavailable.", 400);
    if (p.platform === "facebook") {
      if (!(await ownsClaim())) return;
      publishAttempted = true;
      const response = await graph(`${conn.accountId}/photos`, token, "POST", {
        url: data.signedUrl,
        caption: v.caption,
        published: "true",
      });
      // Photo IDs and Page post IDs are different. Do not silently substitute one for the other.
      knownRemoteId = response.post_id;
    } else {
      let container = p.containerId;
      if (!container) {
        const r = await graph(`${conn.accountId}/media`, token, "POST", {
          image_url: data.signedUrl,
          caption: v.caption,
        });
        container = r.id;
        if (!container) throw new Error("Missing media container");
        if (!(await patch(id, claimId, { containerId: container }))) return;
      }
      const status = await graph(container!, token, "GET", {
        fields: "status_code",
      });
      if (status.status_code === "IN_PROGRESS")
        throw new MetaError(
          "Instagram is still processing the image.",
          429,
          true,
        );
      if (status.status_code !== "FINISHED")
        throw new MetaError(
          "Instagram could not process this image; review and upload a new image.",
          400,
        );
      if (!(await ownsClaim())) return;
      publishAttempted = true;
      const r = await graph(`${conn.accountId}/media_publish`, token, "POST", {
        creation_id: container!,
      });
      knownRemoteId = r.id;
    }
    if (!knownRemoteId) throw new Error("Provider returned no post identifier");
    await patch(id, claimId, {
      status: "published",
      remoteId: knownRemoteId,
      publishedAt: new Date().toISOString(),
      error: undefined,
    });
  } catch (e) {
    const { state } = await loadState(),
      p = state.publications.find((p) => p.id === id)!;
    if (p.status !== "dispatching" || p.claimId !== claimId) return;
    if (knownRemoteId) {
      await patch(id, claimId, {
        status: "published",
        remoteId: knownRemoteId,
        publishedAt: new Date().toISOString(),
        error: undefined,
      });
      return;
    }
    const provider = e instanceof MetaError;
    if (provider && e.code === 190)
      await mutate((s) => {
        const c = s.connections.find((c) => c.platform === p.platform);
        if (c) c.status = "reconnect";
      });
    const safeToRetry =
      (provider && e.transient) || (!provider && !publishAttempted);
    const retry = safeToRetry && p.attempts < 3;
    await patch(id, claimId, {
      status: retry
        ? "scheduled"
        : !publishAttempted || provider
          ? "failed"
          : "manual_review",
      nextAttemptAt: retry
        ? new Date(Date.now() + 2 ** p.attempts * 60000).toISOString()
        : undefined,
      error: provider
        ? e.message
        : publishAttempted
          ? "Publication outcome is uncertain. Inspect the social account before reconciling."
          : "A temporary preparation failure prevented publishing. Retry after checking the service.",
    });
  }
}
export async function sweepPublications() {
  assertLive();
  const { state } = await loadState();
  for (const p of state.publications) {
    if (
      p.status === "dispatching" &&
      Date.now() - new Date(p.dispatchAt!).getTime() > 10 * 60000
    ) {
      // Legacy interrupted claims have no claimId. Adopt a fence only to retire that claim.
      await mutate((s) => {
        const current = s.publications.find((x) => x.id === p.id);
        if (
          current?.status === "dispatching" &&
          current.claimId === p.claimId &&
          current.dispatchAt === p.dispatchAt
        ) {
          current.status = "manual_review";
          current.error =
            "Worker interrupted. Inspect the provider before resolving this outcome.";
        }
      });
    }
    if (
      p.status === "scheduled" &&
      new Date(p.nextAttemptAt || p.scheduledAt) <= new Date()
    )
      await dispatch(p.id);
  }
}
export const publishDue = schedules.task({
  id: "publish-due-posts",
  cron: "* * * * *",
  retry: { maxAttempts: 1 },
  run: sweepPublications,
});
export const metricDefinitions = {
  instagram: {
    reach: "Unique accounts reached for this Instagram media.",
    likes: "Likes reported for this Instagram media.",
    comments: "Comments reported for this Instagram media.",
    saved: "Saves reported for this Instagram media.",
  },
  facebook: {
    post_impressions_unique: "Unique people reached for this Facebook post.",
    post_engaged_users: "People who engaged with this Facebook post.",
  },
};
export async function collectPostMetrics() {
  assertLive();
  const { state } = await loadState();
  const failures: string[] = [];
  for (const p of state.publications.filter(
    (p) =>
      p.status === "published" &&
      p.remoteId &&
      p.publishedAt &&
      Date.now() - new Date(p.publishedAt).getTime() < 30 * 86400000,
  )) {
    for (const [name, definition] of Object.entries(
      metricDefinitions[p.platform],
    )) {
      let value: number | null = null,
        status: Metric["status"] = "pending",
        error: string | undefined;
      try {
        const token = await tokenFor(p.platform);
        const r = await graph(`${p.remoteId}/insights`, token, "GET", {
          metric: name,
        });
        const point = r.data?.[0],
          raw = point?.total_value?.value ?? point?.values?.at(-1)?.value;
        if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
          value = raw;
          status = "available";
        }
      } catch (e) {
        if (e instanceof MetaError && e.unsupportedMetric) {
          status = "unsupported";
          error = "This metric is unsupported by the configured API version.";
        } else {
          status = "error";
          error =
            e instanceof MetaError
              ? e.message
              : "Metric collection failed. Check worker logs and retry.";
          failures.push(`${p.id}:${name}`);
          if (e instanceof MetaError && e.code === 190)
            await mutate((s) => {
              const c = s.connections.find((c) => c.platform === p.platform);
              if (c) c.status = "reconnect";
            });
        }
      }
      const at = new Date().toISOString();
      await mutate((s) => {
        s.metrics = s.metrics.filter(
          (m) =>
            !(
              m.publicationId === p.id &&
              m.name === name &&
              m.at.slice(0, 10) === at.slice(0, 10)
            ),
        );
        s.metrics.push({
          publicationId: p.id,
          name,
          value,
          status,
          error,
          definition,
          at,
        });
      });
    }
  }
  if (failures.length)
    throw new Error(
      `${failures.length} metric collections failed. Inspect account access and worker logs.`,
    );
}
export const collectMetrics = schedules.task({
  id: "collect-post-metrics",
  cron: "0 2 * * *",
  retry: { maxAttempts: 1 },
  run: collectPostMetrics,
});
export const healthCheck = schedules.task({
  id: "workflow-health-check",
  cron: "*/15 * * * *",
  run: async () => {
    assertLive();
    const { state } = await loadState();
    const issues = state.publications.filter(
      (p) =>
        ["failed", "manual_review"].includes(p.status) ||
        (p.status === "scheduled" &&
          Date.now() - new Date(p.nextAttemptAt || p.scheduledAt).getTime() >
            15 * 60000),
    );
    const staleMetrics = state.publications.filter((p) => {
      if (p.status !== "published" || !p.publishedAt) return false;
      const age = Date.now() - new Date(p.publishedAt).getTime();
      if (age < 36 * 3600000 || age > 30 * 86400000) return false;
      return (
        Object.keys(metricDefinitions[p.platform]).some((name) => {
          const last = state.metrics
            .filter((m) => m.publicationId === p.id && m.name === name)
            .at(-1);
          return (
            !last ||
            last.status === "error" ||
            last.status === "pending" ||
            Date.now() - new Date(last.at).getTime() > 36 * 3600000
          );
        }) ||
        Object.keys(metricDefinitions[p.platform]).every(
          (name) =>
            state.metrics
              .filter((m) => m.publicationId === p.id && m.name === name)
              .at(-1)?.status === "unsupported",
        )
      );
    });
    const disconnected = state.connections.filter(
      (c) => c.status === "reconnect",
    );
    if (issues.length || staleMetrics.length || disconnected.length)
      throw new Error(
        `${issues.length} publication issues, ${staleMetrics.length} stale metric collections, ${disconnected.length} accounts need reconnection. Open ${required("APP_URL")}.`,
      );
  },
});
