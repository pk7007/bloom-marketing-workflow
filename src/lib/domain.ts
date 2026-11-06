import { z } from "zod";
export const platformSchema = z.enum(["instagram", "facebook"]);
export type Platform = z.infer<typeof platformSchema>;
export type Role = "admin" | "creator" | "approver";
export type Actor = { id: string; email: string; role: Role };
export type Asset = {
  id: string;
  path: string;
  url?: string;
  width: number;
  height: number;
  bytes: number;
  mime: "image/jpeg";
};
export type Version = {
  id: string;
  caption: string;
  asset: Asset | null;
  createdAt: string;
  author: string;
};
export type Content = {
  id: string;
  title: string;
  brief: string;
  platform: Platform;
  versions: Version[];
  status: "draft" | "in_review" | "changes_requested" | "approved";
  approvedVersion: string | null;
  comments: { author: string; text: string; at: string }[];
  createdAt: string;
};
export type Publication = {
  id: string;
  contentId: string;
  versionId: string;
  platform: Platform;
  scheduledAt: string;
  status:
    | "scheduled"
    | "dispatching"
    | "published"
    | "failed"
    | "manual_review"
    | "cancelled";
  attempts: number;
  nextAttemptAt?: string;
  dispatchAt?: string;
  remoteId?: string;
  containerId?: string;
  publishedAt?: string;
  error?: string;
  reconciliation?: string;
  accountId?: string;
  claimId?: string;
};
export type Metric = {
  publicationId: string;
  name: string;
  value: number | null;
  at: string;
  definition: string;
  status?: "available" | "unsupported" | "error" | "pending";
  error?: string;
};
export type Connection = {
  platform: Platform;
  accountId: string;
  name: string;
  status: "connected" | "reconnect";
  expiresAt?: string;
};
export type Brand = {
  name: string;
  description: string;
  audience: string;
  tone: string;
  facts: string;
  prohibited: string;
  timezone: string;
};
export type Usage = {
  id: string;
  at: string;
  status: "reserved" | "success" | "failed";
  model: string;
  tokens: number | null;
  promptVersion: string;
};
export type State = {
  brand: Brand;
  contents: Content[];
  publications: Publication[];
  connections: Connection[];
  metrics: Metric[];
  usage: Usage[];
  approvals: {
    id: string;
    contentId: string;
    versionId: string;
    decision: "approve" | "changes";
    reviewer: string;
    comment: string;
    at: string;
  }[];
  audit: { id: string; actor: string; action: string; at: string }[];
};
export const assetSchema = z.object({
  id: z.string().uuid(),
  path: z.string().min(1),
  url: z.string().optional(),
  width: z.number().positive(),
  height: z.number().positive(),
  bytes: z
    .number()
    .positive()
    .max(8 * 1024 * 1024),
  mime: z.literal("image/jpeg"),
});
export const brandSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(2000),
  audience: z.string().max(1000),
  tone: z.string().max(500),
  facts: z.string().max(3000),
  prohibited: z.string().max(2000),
  timezone: z.string().refine((v) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }, "Use a valid IANA timezone"),
});
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("brand"), brand: brandSchema }),
  z.object({
    type: z.literal("create"),
    title: z.string().min(1).max(150),
    brief: z.string().min(1).max(4000),
    platform: platformSchema,
    caption: z.string().max(2200),
    asset: assetSchema.nullable(),
  }),
  z.object({
    type: z.literal("edit"),
    id: z.string(),
    expectedVersion: z.string(),
    submitForReview: z.boolean().optional(),
    caption: z.string().max(2200),
    asset: assetSchema.nullable(),
  }),
  z.object({
    type: z.literal("submit"),
    id: z.string(),
    expectedVersion: z.string(),
  }),
  z.object({
    type: z.literal("review"),
    id: z.string(),
    expectedVersion: z.string(),
    decision: z.enum(["approve", "changes"]),
    comment: z.string().max(2000),
  }),
  z.object({
    type: z.literal("schedule"),
    id: z.string(),
    expectedVersion: z.string(),
    scheduledAt: z.string().datetime(),
  }),
  z.object({
    type: z.literal("reschedule"),
    id: z.string(),
    scheduledAt: z.string().datetime(),
  }),
  z.object({ type: z.literal("cancel"), id: z.string() }),
  z.object({ type: z.literal("disconnect"), platform: platformSchema }),
  z.object({
    type: z.literal("reconcile"),
    id: z.string(),
    remoteId: z
      .string()
      .regex(/^[0-9_]+$/)
      .min(1),
  }),
  z.object({
    type: z.literal("resolve_absent"),
    id: z.string(),
    confirmedAbsent: z.literal(true),
    comment: z.string().trim().min(20).max(2000),
  }),
]);
export type Command = z.infer<typeof commandSchema>;
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const canApprove = (role: Role) =>
  role === "admin" || role === "approver";
export function validateAsset(asset: Asset | null, platform: Platform) {
  if (!asset) throw new AppError("Upload a JPEG image before submitting.");
  if (asset.mime !== "image/jpeg" || asset.bytes > 8 * 1024 * 1024)
    throw new AppError("Use a JPEG image under 8 MB.");
  if (
    platform === "instagram" &&
    (asset.width < 320 ||
      asset.width > 1440 ||
      asset.width / asset.height < 0.8 ||
      asset.width / asset.height > 1.91)
  )
    throw new AppError(
      "Instagram images must be 320–1440 px wide, with a ratio between 4:5 and 1.91:1.",
    );
  if (platform === "facebook" && (asset.width < 200 || asset.height < 200))
    throw new AppError("Facebook images must be at least 200 × 200 px.");
}
export function emptyState(): State {
  return {
    brand: {
      name: "Your brand",
      description: "",
      audience: "",
      tone: "Warm, clear, and helpful",
      facts: "",
      prohibited: "",
      timezone: "Asia/Kolkata",
    },
    contents: [],
    publications: [],
    connections: [],
    metrics: [],
    usage: [],
    approvals: [],
    audit: [],
  };
}
export function applyCommand(
  source: State,
  command: Command,
  actor: Actor,
  now = new Date(),
): State {
  const s = structuredClone(source),
    c = command,
    at = now.toISOString();
  if (c.type === "brand") {
    if (actor.role !== "admin")
      throw new AppError("Only admins can change brand settings.", 403);
    s.brand = c.brand;
  } else if (c.type === "disconnect") {
    if (actor.role !== "admin")
      throw new AppError("Only admins can manage connections.", 403);
    if (
      s.publications.some(
        (p) => p.platform === c.platform && p.status === "dispatching",
      )
    )
      throw new AppError(
        "Wait for publishing to finish before disconnecting.",
        409,
      );
    const old = s.connections.find((x) => x.platform === c.platform);
    if (old)
      s.publications.forEach((p) => {
        if (p.platform === c.platform && !p.accountId)
          p.accountId = old.accountId;
      });
    s.connections = s.connections.filter((x) => x.platform !== c.platform);
    s.publications.forEach((p) => {
      if (p.platform === c.platform && p.status === "scheduled")
        p.status = "cancelled";
    });
  } else if (c.type === "create") {
    s.contents.unshift({
      id: crypto.randomUUID(),
      title: c.title,
      brief: c.brief,
      platform: c.platform,
      status: "draft",
      approvedVersion: null,
      comments: [],
      createdAt: at,
      versions: [
        {
          id: crypto.randomUUID(),
          caption: c.caption,
          asset: c.asset,
          createdAt: at,
          author: actor.email,
        },
      ],
    });
  } else if (
    c.type === "cancel" ||
    c.type === "reschedule" ||
    c.type === "reconcile" ||
    c.type === "resolve_absent"
  ) {
    if (!canApprove(actor.role))
      throw new AppError("An approver or admin is required.", 403);
    const p = s.publications.find((x) => x.id === c.id);
    if (!p) throw new AppError("Publication not found.", 404);
    if (c.type === "resolve_absent") {
      if (actor.role !== "admin")
        throw new AppError("Only an admin can resolve an absent post.", 403);
      if (p.status !== "manual_review")
        throw new AppError(
          "This publication is not awaiting investigation.",
          409,
        );
      if (
        !p.dispatchAt ||
        now.getTime() - new Date(p.dispatchAt).getTime() < 10 * 60_000
      )
        throw new AppError(
          "Wait at least ten minutes after dispatch before confirming absence.",
          409,
        );
      p.status = "failed";
      p.reconciliation = `Absence confirmed by ${actor.email}: ${c.comment}`;
      p.error =
        "Admin verified that no post exists. A new approved publication may be scheduled.";
    } else if (c.type === "reconcile") {
      if (p.status !== "manual_review")
        throw new AppError("Only uncertain publications can be reconciled.");
      p.remoteId = c.remoteId;
      p.status = "published";
      p.publishedAt = at;
      p.reconciliation = `Verified by ${actor.email}`;
      p.error = undefined;
      if (
        s.publications.some(
          (other) =>
            other.id !== p.id &&
            other.platform === p.platform &&
            other.remoteId === c.remoteId,
        )
      )
        throw new AppError(
          "This remote post is already linked to another publication.",
          409,
        );
    } else {
      if (p.status !== "scheduled")
        throw new AppError(
          "Only scheduled posts can be cancelled or moved. Dispatch may already have started.",
          409,
        );
      if (c.type === "cancel") p.status = "cancelled";
      else {
        future(c.scheduledAt, now);
        p.scheduledAt = c.scheduledAt;
        p.nextAttemptAt = undefined;
      }
    }
  } else {
    const item = s.contents.find((x) => x.id === c.id);
    if (!item) throw new AppError("Content not found.", 404);
    const current = item.versions.at(-1)!;
    if (c.expectedVersion !== current.id)
      throw new AppError(
        "This content changed since you opened it. Refresh and review the latest version.",
        409,
      );
    if (c.type === "edit") {
      if (
        s.publications.some(
          (p) =>
            p.contentId === item.id &&
            ["dispatching", "manual_review"].includes(p.status),
        )
      )
        throw new AppError(
          "Publishing is in progress or its outcome is unresolved. Resolve it before editing.",
          409,
        );
      if (current.caption !== c.caption || current.asset?.id !== c.asset?.id) {
        item.versions.push({
          id: crypto.randomUUID(),
          caption: c.caption,
          asset: c.asset,
          createdAt: at,
          author: actor.email,
        });
        item.approvedVersion = null;
        item.status = "draft";
        s.publications.forEach((p) => {
          if (p.contentId === item.id && p.status === "scheduled")
            p.status = "cancelled";
        });
      }
      if (c.submitForReview) {
        const updated = item.versions.at(-1)!;
        validateAsset(updated.asset, item.platform);
        if (!updated.caption.trim()) throw new AppError("Add a caption first.");
        if (item.status === "approved")
          throw new AppError("This version is already approved.");
        item.status = "in_review";
      }
    }
    if (c.type === "submit") {
      validateAsset(current.asset, item.platform);
      if (!current.caption.trim()) throw new AppError("Add a caption first.");
      if (item.status === "approved")
        throw new AppError("This version is already approved.");
      item.status = "in_review";
    }
    if (c.type === "review") {
      if (!canApprove(actor.role))
        throw new AppError("Creators cannot approve content.", 403);
      if (item.status !== "in_review")
        throw new AppError("Submit this draft for review first.");
      if (c.decision === "approve") {
        validateAsset(current.asset, item.platform);
        item.status = "approved";
        item.approvedVersion = current.id;
      } else {
        if (!c.comment.trim())
          throw new AppError("Explain the requested changes.");
        item.status = "changes_requested";
        item.approvedVersion = null;
      }
      (s.approvals ??= []).push({
        id: crypto.randomUUID(),
        contentId: item.id,
        versionId: current.id,
        decision: c.decision,
        reviewer: actor.email,
        comment: c.comment,
        at,
      });
      if (c.comment.trim())
        item.comments.push({ author: actor.email, text: c.comment, at });
    }
    if (c.type === "schedule") {
      if (!canApprove(actor.role))
        throw new AppError("Creators cannot schedule publication.", 403);
      future(c.scheduledAt, now);
      if (item.status !== "approved" || item.approvedVersion !== current.id)
        throw new AppError("The latest version needs approval.");
      validateAsset(current.asset, item.platform);
      if (
        s.publications.some(
          (p) =>
            p.contentId === item.id &&
            ["dispatching", "manual_review"].includes(p.status),
        )
      )
        throw new AppError(
          "Resolve the existing publication before scheduling another version.",
          409,
        );
      if (
        !s.connections.some(
          (x) => x.platform === item.platform && x.status === "connected",
        )
      )
        throw new AppError(`Connect ${item.platform} before scheduling.`);
      if (
        s.publications.some(
          (p) =>
            p.contentId === item.id &&
            p.versionId === current.id &&
            ["scheduled", "dispatching", "published", "manual_review"].includes(
              p.status,
            ),
        )
      )
        throw new AppError("This version already has a publication.");
      s.publications.push({
        id: crypto.randomUUID(),
        contentId: item.id,
        versionId: current.id,
        platform: item.platform,
        scheduledAt: c.scheduledAt,
        status: "scheduled",
        attempts: 0,
        accountId: s.connections.find((c) => c.platform === item.platform)!
          .accountId,
      });
    }
  }
  s.audit.unshift({
    id: crypto.randomUUID(),
    actor: actor.email,
    action: c.type,
    at,
  });
  return s;
}
function future(at: string, now: Date) {
  if (
    !Number.isFinite(new Date(at).getTime()) ||
    new Date(at).getTime() < now.getTime() + 60_000
  )
    throw new AppError("Choose a time at least one minute in the future.");
}
export function claimPublication(
  state: State,
  id: string,
  now = new Date(),
): boolean {
  const p = state.publications.find((x) => x.id === id);
  if (
    !p ||
    p.status !== "scheduled" ||
    new Date(p.nextAttemptAt || p.scheduledAt) > now
  )
    return false;
  const c = state.contents.find((x) => x.id === p.contentId);
  const conn = state.connections.find((x) => x.platform === p.platform);
  if (
    !c ||
    c.status !== "approved" ||
    c.approvedVersion !== p.versionId ||
    c.versions.at(-1)?.id !== p.versionId
  ) {
    p.status = "cancelled";
    p.error = "Approval no longer matches the current version.";
    return false;
  }
  if (!conn || conn.status !== "connected") {
    p.status = "failed";
    p.error = "Reconnect the social account.";
    return false;
  }
  if (p.accountId && p.accountId !== conn.accountId) {
    p.status = "cancelled";
    p.error = "The connected account changed. Review before scheduling again.";
    return false;
  }
  if (conn.expiresAt && new Date(conn.expiresAt) <= now) {
    conn.status = "reconnect";
    p.status = "failed";
    p.error = "Reconnect the expired account.";
    return false;
  }
  p.accountId = conn.accountId;
  p.status = "dispatching";
  p.claimId = crypto.randomUUID();
  p.dispatchAt = now.toISOString();
  p.attempts++;
  return true;
}
