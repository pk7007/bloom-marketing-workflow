"use client";
import { useEffect, useState, useRef } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Flower2,
  ImagePlus,
  LayoutDashboard,
  Link2,
  Loader2,
  LogOut,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  X,
  BarChart3,
  AlertCircle,
} from "lucide-react";
import { Button, Modal, cn } from "./ui";
import {
  applyCommand,
  commandSchema,
  canApprove,
  emptyState,
  type Actor,
  type Asset,
  type Brand,
  type Command,
  type Content,
  type Platform,
  type State,
} from "@/lib/domain";
import { demoState } from "@/lib/demo";
import { localDateTime, zonedToUtc } from "@/lib/time";
import {
  MAX_SOURCE_BYTES,
  SOURCE_LIMIT_LABEL,
  assembleCaption,
} from "@/lib/limits";
type View =
  | "Overview"
  | "Content studio"
  | "Approvals"
  | "Calendar"
  | "Analytics"
  | "Brand settings"
  | "Team & connections";
type Option = {
  platform: Platform;
  caption: string;
  hashtags: string[];
  claimsToVerify: string[];
};
const navigation = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Content studio", icon: FileText },
  { label: "Approvals", icon: CheckCheck },
  { label: "Calendar", icon: CalendarDays },
  { label: "Analytics", icon: BarChart3 },
] as const;
const demoUser: Actor = {
  id: "demo",
  email: "alex@example.com",
  role: "admin",
};
const json = async (path: string, body?: unknown) => {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) {
    const issue = new Error(data.error || "Request failed.") as Error & {
      status: number;
    };
    issue.status = response.status;
    throw issue;
  }
  return data;
};
const label = (v: string) =>
  v.replaceAll("_", " ").replace(/^./, (s) => s.toUpperCase());
function Instagram({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r=".8" fill="currentColor" />
    </svg>
  );
}
function Facebook({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M14 22v-9h3l.5-4H14V7c0-1.2.3-2 2-2h2V1.5c-.5-.1-1.8-.2-3-.2-3 0-5 1.9-5 5.3V9H7v4h3v9z" />
    </svg>
  );
}
function PlatformIcon({
  platform,
  size = 15,
}: {
  platform: Platform;
  size?: number;
}) {
  return platform === "instagram" ? (
    <Instagram size={size} />
  ) : (
    <Facebook size={size} />
  );
}
function Badge({ value }: { value: string }) {
  return (
    <span className={cn("badge", value)}>
      <i />
      {label(value)}
    </span>
  );
}
export default function Workspace({ demo }: { demo: boolean }) {
  const [state, setState] = useState<State>(emptyState()),
    [user, setUser] = useState<Actor>(demoUser),
    [loaded, setLoaded] = useState(false),
    [authorized, setAuthorized] = useState(demo),
    [view, setView] = useState<View>("Overview"),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [mobile, setMobile] = useState(false),
    [search, setSearch] = useState("");
  const [composer, setComposer] = useState(false),
    [editId, setEditId] = useState<string | null>(null),
    [scheduleId, setScheduleId] = useState<string | null>(null),
    [moveId, setMoveId] = useState<string | null>(null),
    [reviewId, setReviewId] = useState<string | null>(null),
    [comment, setComment] = useState(""),
    [when, setWhen] = useState(""),
    [passwordSetup, setPasswordSetup] = useState(false),
    [newPassword, setNewPassword] = useState("");
  const [filter, setFilter] = useState("All content"),
    [month, setMonth] = useState(new Date().getMonth()),
    [year, setYear] = useState(new Date().getFullYear()),
    [urls, setUrls] = useState<Record<string, string>>({}),
    [members, setMembers] = useState<
      { user_id: string; email: string; role: Actor["role"] }[]
    >([]);
  const [invite, setInvite] = useState(false),
    [inviteEmail, setInviteEmail] = useState(""),
    [inviteRole, setInviteRole] = useState<Actor["role"]>("creator"),
    [reconcile, setReconcile] = useState<string | null>(null),
    [remoteId, setRemoteId] = useState("");
  const [reviewSnapshot, setReviewSnapshot] = useState<Content | null>(null);
  const [composerSnapshot, setComposerSnapshot] = useState<Content | undefined>(
    undefined,
  );
  const scheduleBase = useRef<string>("");
  function openReview(id: string) {
    setReviewSnapshot(
      structuredClone(stateRef.current.contents.find((c) => c.id === id)!),
    );
    setReviewId(id);
    setError("");
  }
  function openSchedule(id: string) {
    scheduleBase.current = stateRef.current.contents
      .find((c) => c.id === id)!
      .versions.at(-1)!.id;
    setScheduleId(id);
    setError("");
  }
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    if (demo || !authorized) return;
    const timer = setInterval(() => {
      refresh().catch(reportError);
    }, 30_000);
    return () => clearInterval(timer);
  }, [demo, authorized]);
  const refreshSequence = useRef(0);
  const accessEpoch = useRef(0);
  const [absenceId, setAbsenceId] = useState<string | null>(null),
    [absenceNote, setAbsenceNote] = useState(""),
    [absenceConfirmed, setAbsenceConfirmed] = useState(false);
  function reportError(e: unknown) {
    setError((e as Error).message);
    if (
      !demo &&
      [401, 403].includes((e as Error & { status?: number }).status || 0)
    ) {
      accessEpoch.current++;
      refreshSequence.current++;
      setAuthorized(false);
      setState(emptyState());
      setUrls({});
      setMembers([]);
      setComposer(false);
      setReviewId(null);
      setScheduleId(null);
      setMoveId(null);
      setReconcile(null);
    }
  }
  async function refresh() {
    const sequence = ++refreshSequence.current,
      epoch = accessEpoch.current;
    const data = await json("/api/state");
    if (sequence !== refreshSequence.current || epoch !== accessEpoch.current)
      return data;
    if (data.state) {
      setState(data.state);
      stateRef.current = data.state;
      setUser(data.user);
      setAuthorized(true);
      const assets = await json("/api/assets");
      if (sequence === refreshSequence.current && epoch === accessEpoch.current)
        setUrls(assets.urls);
    }
    return data;
  }
  useEffect(() => {
    if (demo) {
      try {
        const saved = localStorage.getItem("bloom-demo-v1");
        setState(saved ? JSON.parse(saved) : demoState());
      } catch {
        setState(demoState());
      }
      setLoaded(true);
    } else {
      refresh()
        .catch(reportError)
        .finally(() => setLoaded(true));
    }
    const params = new URLSearchParams(location.search);
    if (params.get("setup") === "password") setPasswordSetup(true);
    if (params.has("connection"))
      setError(
        "Meta connection failed. Check Page access, linked Instagram account, app permissions, and META_PAGE_ID.",
      );
    if (params.has("connected")) setToast("Your Meta accounts are connected.");
  }, [demo]);
  useEffect(() => {
    if (demo && loaded) {
      try {
        localStorage.setItem("bloom-demo-v1", JSON.stringify(state));
      } catch {
        setError(
          "Local demo storage is full. Remove a large image or reset the demo.",
        );
      }
    }
  }, [state, demo, loaded]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (view === "Team & connections" && !demo && user.role === "admin")
      json("/api/team")
        .then((d) => setMembers(d.members))
        .catch(reportError);
  }, [view, demo, user.role]);
  async function command(c: Command) {
    setBusy(true);
    setError("");
    const epoch = accessEpoch.current;
    refreshSequence.current++;
    try {
      if (demo) {
        const next = applyCommand(
          stateRef.current,
          commandSchema.parse(c),
          user,
        );
        stateRef.current = next;
        setState(next);
      } else {
        const data = await json("/api/commands", c);
        if (epoch !== accessEpoch.current) return false;
        refreshSequence.current++;
        stateRef.current = data.state;
        setState(data.state);
      }
      return true;
    } catch (e) {
      reportError(e);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function nav(v: View) {
    setView(v);
    setMobile(false);
    setSearch("");
  }
  function compose(id: string | null = null) {
    setEditId(id);
    setComposerSnapshot(
      id
        ? structuredClone(stateRef.current.contents.find((c) => c.id === id))
        : undefined,
    );
    setComposer(true);
    setError("");
  }
  const image = (item: Content) => {
    const a = item.versions.at(-1)?.asset;
    return a ? urls[a.id] || a.url : undefined;
  };
  const pending = state.contents.filter((c) => c.status === "in_review"),
    scheduled = state.publications.filter((p) => p.status === "scheduled"),
    published = state.publications.filter((p) => p.status === "published"),
    issues = state.publications.filter((p) =>
      ["failed", "manual_review"].includes(p.status),
    ),
    timezone = state.brand.timezone;
  const date = (value: string) =>
    new Intl.DateTimeFormat("en", {
      timeZone: timezone,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  const filtered = state.contents.filter(
    (c) =>
      (filter === "All content" || c.status === filter) &&
      `${c.title} ${c.brief} ${c.versions.at(-1)?.caption}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const review = reviewSnapshot;
  if (!loaded)
    return (
      <div className="loading">
        <Flower2 />
        <p>Opening your workspace…</p>
      </div>
    );
  if (!authorized)
    return (
      <Login
        error={error}
        onLogin={async () => {
          setError("");
          await refresh();
        }}
      />
    );
  return (
    <div className="app-shell">
      <aside className={cn("sidebar", mobile && "open")}>
        <a
          href="#"
          className="wordmark"
          onClick={(e) => {
            e.preventDefault();
            nav("Overview");
          }}
        >
          <span className="logo">
            <Flower2 size={25} />
          </span>
          bloom<span className="wordmark-dot">.</span>
        </a>
        <button
          className="workspace-switch"
          onClick={() => nav("Brand settings")}
        >
          <span className="workspace-avatar">
            {state.brand.name.slice(0, 1)}
          </span>
          <span>
            <strong>{state.brand.name}</strong>
            <small>Team workspace</small>
          </span>
          <Settings2 size={15} />
        </button>
        <span className="nav-heading">WORKSPACE</span>
        <nav>
          {navigation.map(({ label: target, icon: Icon }) => (
            <button
              key={target}
              className={cn("nav-item", view === target && "active")}
              onClick={() => nav(target)}
            >
              <Icon size={18} />
              {target}
              {target === "Approvals" && pending.length > 0 && (
                <span className="nav-count">{pending.length}</span>
              )}
            </button>
          ))}
        </nav>
        <span className="nav-heading settings-heading">MANAGE</span>
        <nav>
          <button
            className={cn("nav-item", view === "Brand settings" && "active")}
            onClick={() => nav("Brand settings")}
          >
            <BookOpen size={18} />
            Brand settings
          </button>
          <button
            className={cn(
              "nav-item",
              view === "Team & connections" && "active",
            )}
            onClick={() => nav("Team & connections")}
          >
            <Users size={18} />
            Team & connections
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="approval-note">
            <ShieldCheck size={21} />
            <strong>A human touch, always.</strong>
            <p>Every post is reviewed before it meets the world.</p>
            <button onClick={() => nav("Approvals")}>
              Open approvals <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="profile">
            <span className="avatar">
              {user.email.slice(0, 1).toUpperCase()}
            </span>
            <span>
              <strong>{demo ? "Alex Morgan" : user.email.split("@")[0]}</strong>
              <small>{label(user.role)}</small>
            </span>
            {!demo && (
              <button
                title="Sign out"
                className="icon-button"
                onClick={async () => {
                  await json("/api/auth", { logout: true });
                  accessEpoch.current++;
                  refreshSequence.current++;
                  setState(emptyState());
                  setUrls({});
                  setMembers([]);
                  setAuthorized(false);
                }}
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{view}</strong>
          </div>
          <div className="topbar-right">
            <span className="mode-pill">
              <i />
              {demo ? "Demo workspace" : "Private workspace"}
            </span>
            <button
              className="icon-button notification"
              aria-label="View posts needing attention"
              onClick={() => {
                nav("Overview");
                setToast(
                  `${pending.length} awaiting review · ${issues.length} publishing issues`,
                );
              }}
            >
              <Bell size={19} />
              {pending.length + issues.length > 0 && <i />}
            </button>
            <span className="avatar small">
              {user.email.slice(0, 1).toUpperCase()}
            </span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {view === "Overview"
                  ? "YOUR MARKETING, IN FLOW"
                  : `${state.brand.name.toUpperCase()} / WORKSPACE`}
              </div>
              <h1>
                {view === "Overview" ? "Make room for good ideas." : view}
              </h1>
              <p>
                {
                  {
                    Overview:
                      "A little structure. More creativity. Here’s where your content stands.",
                    "Content studio":
                      "From the first spark to the final caption.",
                    Approvals:
                      "A thoughtful second look before every post goes live.",
                    Calendar: "Give every good idea its moment.",
                    Analytics: "Learn what connects. Make more of it.",
                    "Brand settings":
                      "One clear voice, wherever your brand shows up.",
                    "Team & connections":
                      "The people and channels behind your content.",
                  }[view]
                }
              </p>
            </div>
            {!["Brand settings", "Team & connections"].includes(view) && (
              <Button onClick={() => compose()}>
                <Plus size={17} />
                Create content
              </Button>
            )}
          </div>
          {demo && (
            <div className="demo-banner">
              <span>
                <Sparkles size={15} />
                <strong>Explore your workspace.</strong> Sample content is saved
                in this browser. Publishing and AI are simulated.
              </span>
              <div>
                <select
                  aria-label="Demo role"
                  value={user.role}
                  onChange={(e) =>
                    setUser({ ...user, role: e.target.value as Actor["role"] })
                  }
                >
                  <option value="admin">Admin view</option>
                  <option value="creator">Creator view</option>
                  <option value="approver">Approver view</option>
                </select>
                <button
                  onClick={() => {
                    setState(demoState());
                    setToast("Demo reset.");
                  }}
                >
                  Reset demo
                </button>
              </div>
            </div>
          )}
          {error && (
            <div className="error-banner" role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {view === "Overview" && (
            <>
              <div className="stats-grid">
                {[
                  {
                    title: "In the studio",
                    value: state.contents.filter((c) =>
                      ["draft", "changes_requested"].includes(c.status),
                    ).length,
                    icon: FileText,
                    note: "Ideas taking shape",
                    color: "purple",
                  },
                  {
                    title: "Awaiting approval",
                    value: pending.length,
                    icon: CheckCheck,
                    note: pending.length
                      ? "Ready for a fresh pair of eyes"
                      : "All caught up",
                    color: "amber",
                  },
                  {
                    title: "On the calendar",
                    value: scheduled.length,
                    icon: CalendarDays,
                    note: "Approved and ready to go",
                    color: "blue",
                  },
                  {
                    title: "Published posts",
                    value: published.length,
                    icon: Send,
                    note: demo
                      ? "Connect live services to publish"
                      : "Shared with your community",
                    color: "green",
                  },
                ].map((stat) => (
                  <button
                    key={stat.title}
                    className="stat-card"
                    onClick={() =>
                      nav(
                        stat.title === "Awaiting approval"
                          ? "Approvals"
                          : stat.title === "On the calendar"
                            ? "Calendar"
                            : stat.title === "Published posts"
                              ? "Analytics"
                              : "Content studio",
                      )
                    }
                  >
                    <div className="stat-top">
                      <span>{stat.title}</span>
                      <span className={cn("stat-icon", stat.color)}>
                        <stat.icon size={17} />
                      </span>
                    </div>
                    <strong>{stat.value.toString().padStart(2, "0")}</strong>
                    <small>{stat.note}</small>
                  </button>
                ))}
              </div>
              <div className="overview-grid">
                <div className="overview-main">
                  <section className="inspiration-card">
                    <div className="inspiration-copy">
                      <span className="little-pill">
                        <Sparkles size={13} />
                        YOUR NEXT GOOD IDEA
                      </span>
                      <h2>
                        Less blank page.
                        <br />
                        More brand magic.
                      </h2>
                      <p>
                        Turn a simple brief into captions that sound like you.
                        You bring the idea. We’ll help with the words.
                      </p>
                      <Button onClick={() => compose()}>
                        Let’s create something <ArrowRight size={15} />
                      </Button>
                    </div>
                    <div className="hero-art" aria-hidden="true">
                      <div className="orbit one" />
                      <div className="orbit two" />
                      <span className="floating-star star-one">✳</span>
                      <span className="floating-star star-two">✦</span>
                      <div className="art-post">
                        <div className="art-post-head">
                          <span className="tiny-logo">
                            <Flower2 size={14} />
                          </span>
                          <span>
                            {state.brand.name} <small>Thoughtfully made.</small>
                          </span>
                          <MoreHorizontal size={15} />
                        </div>
                        <img src="/samples/ceramics.svg" alt="" />
                        <div className="art-post-line" />
                        <div className="art-post-line short" />
                        <div className="art-approved">
                          <Check size={13} />A little more you.
                        </div>
                      </div>
                      <div className="art-spark">
                        <Sparkles size={17} />
                      </div>
                    </div>
                  </section>
                  <section className="section-block">
                    <div className="section-title">
                      <h2>
                        Fresh from the studio{" "}
                        <span>{state.contents.length}</span>
                      </h2>
                      <button
                        className="text-link"
                        onClick={() => nav("Content studio")}
                      >
                        View all content <ArrowRight size={14} />
                      </button>
                    </div>
                    <div className="content-grid">
                      {state.contents.slice(0, 3).map((c) => (
                        <ContentCard
                          key={c.id}
                          item={c}
                          image={image(c)}
                          onOpen={() => compose(c.id)}
                        />
                      ))}
                      {!state.contents.length && (
                        <Empty
                          text="Your next good idea starts here."
                          action={() => compose()}
                        />
                      )}
                    </div>
                  </section>
                  <section className="panel workflow-strip">
                    <span className="stat-icon purple">
                      <ShieldCheck size={21} />
                    </span>
                    <div>
                      <h3>Good content is a team effort.</h3>
                      <p>Create → Review → Approve → Schedule → Learn</p>
                    </div>
                    <button
                      className="text-link"
                      onClick={() => nav("Approvals")}
                    >
                      Review content <ArrowRight size={14} />
                    </button>
                  </section>
                  {issues.length > 0 && (
                    <section className="panel issue-panel">
                      <h3>Needs your attention</h3>
                      {issues.map((p) => (
                        <div key={p.id} className="issue-row">
                          <AlertCircle size={18} />
                          <div>
                            <strong>
                              {
                                state.contents.find((c) => c.id === p.contentId)
                                  ?.title
                              }
                            </strong>
                            <p>{p.error}</p>
                          </div>
                          {p.status === "manual_review" &&
                            canApprove(user.role) && (
                              <Button
                                variant="secondary"
                                onClick={() => {
                                  setReconcile(p.id);
                                  setRemoteId("");
                                }}
                              >
                                Verify post
                              </Button>
                            )}
                        </div>
                      ))}
                    </section>
                  )}
                </div>
                <aside className="overview-aside">
                  <section className="panel review-panel">
                    <div className="section-title">
                      <h3>A little review goes a long way.</h3>
                      <span className="round-icon">
                        <CheckCheck size={18} />
                      </span>
                    </div>
                    <p>
                      {pending.length
                        ? `${pending.length} ${pending.length === 1 ? "post is" : "posts are"} ready for your feedback.`
                        : "No posts waiting for review. Nice work."}
                    </p>
                    {pending.slice(0, 2).map((c) => (
                      <button
                        key={c.id}
                        className="review-preview"
                        onClick={() => {
                          openReview(c.id);
                          setComment("");
                        }}
                      >
                        {image(c) ? (
                          <img src={image(c)} alt="" />
                        ) : (
                          <ImagePlus size={20} />
                        )}
                        <span>
                          <strong>{c.title}</strong>
                          <small>
                            <PlatformIcon platform={c.platform} />
                            {label(c.platform)}
                          </small>
                        </span>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                    <Button
                      variant="secondary"
                      onClick={() => nav("Approvals")}
                    >
                      Open approval inbox <ArrowRight size={15} />
                    </Button>
                  </section>
                  <section className="panel upcoming-panel">
                    <div className="section-title">
                      <h3>Coming up</h3>
                      <CalendarDays size={18} />
                    </div>
                    <MiniCalendar
                      month={month}
                      year={year}
                      timezone={timezone}
                    />
                    {scheduled.length ? (
                      scheduled.slice(0, 3).map((p) => (
                        <div className="upcoming-item" key={p.id}>
                          <span className="platform-circle">
                            <PlatformIcon platform={p.platform} />
                          </span>
                          <div>
                            <strong>
                              {
                                state.contents.find((c) => c.id === p.contentId)
                                  ?.title
                              }
                            </strong>
                            <small>{date(p.scheduledAt)}</small>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="small-empty">
                        <Clock3 size={20} />
                        <p>
                          A little breathing room.
                          <br />
                          Schedule your next approved post.
                        </p>
                      </div>
                    )}
                    <button
                      className="text-link"
                      onClick={() => nav("Calendar")}
                    >
                      View your calendar <ArrowRight size={14} />
                    </button>
                  </section>
                  <div className="quiet-note">
                    <Flower2 size={21} />
                    <p>
                      Consistency grows from
                      <br />
                      small, thoughtful steps.
                    </p>
                  </div>
                </aside>
              </div>
            </>
          )}
          {view === "Content studio" && (
            <>
              <div className="list-toolbar">
                <div className="tabs">
                  {["All content", "draft", "in_review", "approved"].map(
                    (t) => (
                      <button
                        className={filter === t ? "selected" : ""}
                        key={t}
                        onClick={() => setFilter(t)}
                      >
                        {label(t)}
                      </button>
                    ),
                  )}
                </div>
                <label className="search">
                  <Search size={16} />
                  <input
                    placeholder="Find content…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              </div>
              <div className="content-grid studio-grid">
                {filtered.map((c) => (
                  <ContentCard
                    key={c.id}
                    item={c}
                    image={image(c)}
                    onOpen={() => compose(c.id)}
                    footer={
                      <>
                        <button
                          onClick={() => {
                            openReview(c.id);
                            setComment("");
                          }}
                        >
                          Details & review <ArrowUpRight size={13} />
                        </button>
                        {c.status === "approved" && canApprove(user.role) && (
                          <button
                            onClick={() => {
                              openSchedule(c.id);
                              setMoveId(null);
                              setWhen(
                                localDateTime(
                                  new Date(Date.now() + 86400000).toISOString(),
                                  timezone,
                                ),
                              );
                            }}
                          >
                            Schedule <CalendarDays size={13} />
                          </button>
                        )}
                      </>
                    }
                  />
                ))}
                {!filtered.length && (
                  <Empty text="No content here yet." action={() => compose()} />
                )}
              </div>
            </>
          )}
          {view === "Approvals" && (
            <>
              <div className="panel inbox-intro">
                <span className="stat-icon purple">
                  <ShieldCheck size={23} />
                </span>
                <div>
                  <h3>Every post deserves a second look.</h3>
                  <p>
                    Approval is linked to an exact version. Changes to the
                    caption or image require a fresh review.
                  </p>
                </div>
                <span className="count-pill">{pending.length} waiting</span>
              </div>
              <div className="content-grid studio-grid">
                {pending.map((c) => (
                  <ContentCard
                    key={c.id}
                    item={c}
                    image={image(c)}
                    onOpen={() => {
                      openReview(c.id);
                      setComment("");
                    }}
                    footer={
                      <button
                        onClick={() => {
                          openReview(c.id);
                          setComment("");
                        }}
                      >
                        Review this post <ArrowRight size={14} />
                      </button>
                    }
                  />
                ))}
                {!pending.length && (
                  <Empty text="Your approval inbox is clear." />
                )}
              </div>
            </>
          )}
          {view === "Calendar" && (
            <section className="panel full-calendar">
              <div className="calendar-top">
                <div>
                  <h2>
                    {new Date(year, month).toLocaleString("en", {
                      month: "long",
                      year: "numeric",
                    })}
                  </h2>
                  <small>{timezone} · Publishing runs every minute</small>
                </div>
                <div className="calendar-controls">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setYear(new Date().getFullYear());
                      setMonth(new Date().getMonth());
                    }}
                  >
                    Today
                  </Button>
                  <button
                    className="icon-button"
                    aria-label="Previous month"
                    onClick={() => {
                      const d = new Date(year, month - 1);
                      setMonth(d.getMonth());
                      setYear(d.getFullYear());
                    }}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Next month"
                    onClick={() => {
                      const d = new Date(year, month + 1);
                      setMonth(d.getMonth());
                      setYear(d.getFullYear());
                    }}
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
              <div className="calendar-grid">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div className="day-label" key={d}>
                    {d}
                  </div>
                ))}
                {Array.from({ length: 42 }, (_, i) => {
                  const d = new Date(
                      year,
                      month,
                      1 - new Date(year, month, 1).getDay() + i,
                    ),
                    key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
                    posts = state.publications.filter(
                      (p) =>
                        p.status !== "cancelled" &&
                        localDateTime(p.scheduledAt, timezone).startsWith(key),
                    );
                  return (
                    <div
                      key={i}
                      className={cn(
                        "calendar-cell",
                        d.getMonth() !== month && "muted",
                      )}
                    >
                      <span>{d.getDate()}</span>
                      {posts.map((p) => (
                        <button
                          key={p.id}
                          className={cn("calendar-post", p.status)}
                          onClick={() => {
                            if (
                              p.status === "scheduled" &&
                              canApprove(user.role)
                            ) {
                              setMoveId(p.id);
                              setScheduleId(null);
                              setWhen(localDateTime(p.scheduledAt, timezone));
                            } else setToast(p.error || label(p.status));
                          }}
                        >
                          <PlatformIcon platform={p.platform} size={12} />
                          <span>
                            {
                              state.contents.find((c) => c.id === p.contentId)
                                ?.title
                            }
                          </span>
                          <small>
                            {localDateTime(p.scheduledAt, timezone).slice(11)}
                          </small>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
              <div className="calendar-legend">
                <i />
                Scheduled <i className="green-dot" />
                Published <i className="red-dot" />
                Needs attention
              </div>
            </section>
          )}
          {view === "Analytics" && (
            <>
              <div className="panel analytics-intro">
                <span className="stat-icon green">
                  <TrendingUp size={24} />
                </span>
                <div>
                  <h3>Real results. Clear context.</h3>
                  <p>
                    Metrics are collected daily for 30 days after publishing.
                    Each platform measures engagement differently.
                  </p>
                </div>
                <span className="count-pill">{published.length} published</span>
              </div>
              {!published.length ? (
                <div className="panel analytics-empty">
                  <BarChart3 size={45} />
                  <h2>Your story is still unfolding.</h2>
                  <p>
                    Publish your first approved post to start collecting real
                    performance data.
                  </p>
                  <Button
                    variant="secondary"
                    onClick={() => nav("Content studio")}
                  >
                    Explore your content <ArrowRight size={15} />
                  </Button>
                </div>
              ) : (
                <div className="analytics-grid">
                  {(["instagram", "facebook"] as Platform[]).map((platform) => (
                    <section className="panel" key={platform}>
                      <h3 className="platform-title">
                        <PlatformIcon platform={platform} size={22} />
                        {label(platform)}
                      </h3>
                      {published
                        .filter((p) => p.platform === platform)
                        .map((p) => (
                          <div className="metric-post" key={p.id}>
                            <strong>
                              {
                                state.contents.find((c) => c.id === p.contentId)
                                  ?.title
                              }
                            </strong>
                            <small>Published {date(p.publishedAt!)}</small>
                            <div className="metric-grid">
                              {(platform === "instagram"
                                ? ["reach", "likes", "comments", "saved"]
                                : [
                                    "post_impressions_unique",
                                    "post_engaged_users",
                                  ]
                              ).map((name) => {
                                const m = state.metrics
                                  .filter(
                                    (m) =>
                                      m.publicationId === p.id &&
                                      m.name === name,
                                  )
                                  .at(-1);
                                return (
                                  <div
                                    key={name}
                                    title={[m?.definition, m?.error]
                                      .filter(Boolean)
                                      .join(" ")}
                                  >
                                    <small>{label(name)}</small>
                                    <strong>
                                      {m?.value?.toLocaleString() ??
                                        "Unavailable"}
                                    </strong>
                                    <small>
                                      {m
                                        ? `${m.status === "error" ? "Collection failed" : m.status === "unsupported" ? "Unsupported" : m.status === "pending" ? "Pending" : "Updated"} ${date(m.at)}`
                                        : "Awaiting collection"}
                                    </small>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      {!published.some((p) => p.platform === platform) && (
                        <p className="subtle">
                          No published posts on this platform yet.
                        </p>
                      )}
                    </section>
                  ))}
                </div>
              )}
            </>
          )}
          {view === "Brand settings" && (
            <BrandForm
              brand={state.brand}
              disabled={user.role !== "admin" || busy}
              onSave={async (brand) => {
                if (await command({ type: "brand", brand }))
                  setToast("Your brand settings are saved.");
              }}
            />
          )}
          {view === "Team & connections" && (
            <div className="settings-grid">
              <section className="panel settings-panel">
                <div className="section-title">
                  <h2>Your channels</h2>
                  <Link2 size={20} />
                </div>
                <p>
                  Connect one Facebook Page and its linked Instagram
                  professional account.
                </p>
                {(["instagram", "facebook"] as Platform[]).map((platform) => {
                  const connection = state.connections.find(
                    (c) => c.platform === platform,
                  );
                  return (
                    <div className="channel-row" key={platform}>
                      <span className={cn("channel-icon", platform)}>
                        <PlatformIcon platform={platform} size={23} />
                      </span>
                      <div>
                        <strong>{label(platform)}</strong>
                        <small>{connection?.name || "Not connected"}</small>
                      </div>
                      <Badge value={connection?.status || "disconnected"} />
                      {connection && user.role === "admin" && (
                        <button
                          className="text-link"
                          onClick={async () => {
                            if (await command({ type: "disconnect", platform }))
                              setToast(
                                "Account disconnected. Scheduled posts were cancelled.",
                              );
                          }}
                        >
                          Disconnect
                        </button>
                      )}
                    </div>
                  );
                })}
                <Button
                  variant="secondary"
                  disabled={busy || user.role !== "admin"}
                  onClick={async () => {
                    if (demo) {
                      setToast(
                        "Demo channels are simulated. Configure Meta credentials for live connections.",
                      );
                      return;
                    }
                    try {
                      setBusy(true);
                      const d = await json("/api/meta/connect", {});
                      location.assign(d.url);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Link2 size={16} />
                  Connect with Meta
                </Button>
                <div className="info-note">
                  <ShieldCheck size={17} />
                  <span>
                    Credentials are encrypted on the server. Only admins can
                    manage connections.
                  </span>
                </div>
              </section>
              <section className="panel settings-panel">
                <div className="section-title">
                  <h2>The people behind the posts</h2>
                  {user.role === "admin" && (
                    <Button variant="secondary" onClick={() => setInvite(true)}>
                      <Plus size={15} />
                      Invite
                    </Button>
                  )}
                </div>
                <p>
                  Creators draft. Approvers review and schedule. Admins manage
                  the workspace.
                </p>
                {(demo
                  ? [
                      {
                        user_id: "1",
                        email: "alex@example.com",
                        role: "admin" as const,
                      },
                      {
                        user_id: "2",
                        email: "sam@example.com",
                        role: "creator" as const,
                      },
                      {
                        user_id: "3",
                        email: "maya@example.com",
                        role: "approver" as const,
                      },
                    ]
                  : members
                ).map((m) => (
                  <div key={m.user_id} className="member-row">
                    <span className="avatar">{m.email[0].toUpperCase()}</span>
                    <div>
                      <strong>{m.email}</strong>
                      <small>{label(m.role)}</small>
                    </div>
                    {!demo && user.role === "admin" && m.user_id !== user.id ? (
                      <>
                        <select
                          aria-label={`Role for ${m.email}`}
                          value={m.role}
                          onChange={async (e) => {
                            try {
                              await json("/api/team", {
                                action: "role",
                                userId: m.user_id,
                                role: e.target.value,
                              });
                              const d = await json("/api/team");
                              setMembers(d.members);
                            } catch (e) {
                              setError((e as Error).message);
                            }
                          }}
                        >
                          <option value="creator">Creator</option>
                          <option value="approver">Approver</option>
                          <option value="admin">Admin</option>
                        </select>
                        <button
                          className="icon-button"
                          aria-label={`Remove ${m.email}`}
                          onClick={async () => {
                            if (
                              !confirm(`Remove ${m.email} from this workspace?`)
                            )
                              return;
                            try {
                              await json("/api/team", {
                                action: "remove",
                                userId: m.user_id,
                              });
                              setMembers(
                                members.filter((x) => x.user_id !== m.user_id),
                              );
                            } catch (e) {
                              setError((e as Error).message);
                            }
                          }}
                        >
                          <X size={16} />
                        </button>
                      </>
                    ) : (
                      <span className="role-pill">{label(m.role)}</span>
                    )}
                  </div>
                ))}
                {!demo && user.role !== "admin" && (
                  <p className="subtle">
                    Ask your admin to manage team membership.
                  </p>
                )}
              </section>
              <section className="panel settings-panel">
                <h2>Workspace activity</h2>
                {state.audit.slice(0, 12).map((a) => (
                  <div className="audit-row" key={a.id}>
                    <span className="audit-dot" />
                    <div>
                      <strong>{label(a.action)}</strong>
                      <small>
                        {a.actor} · {date(a.at)}
                      </small>
                    </div>
                  </div>
                ))}
                {!state.audit.length && (
                  <p className="subtle">Changes and approvals appear here.</p>
                )}
              </section>
              <section className="panel settings-panel">
                <h2>AI usage</h2>
                <div className="usage-number">
                  {
                    state.usage.filter((u) =>
                      u.at.startsWith(new Date().toISOString().slice(0, 7)),
                    ).length
                  }
                  <small> requests this month</small>
                </div>
                <p>
                  Each generation reserves one request. Failed requests count
                  toward the cap to prevent uncontrolled retries.
                </p>
                {demo && (
                  <div className="info-note">
                    <Sparkles size={17} />
                    <span>
                      Demo suggestions use local templates and do not call an AI
                      service.
                    </span>
                  </div>
                )}
              </section>
            </div>
          )}
          <footer className="page-footer">
            <span>
              <Flower2 size={14} />
              Made for a more thoughtful workflow.
            </span>
            <span>
              {state.brand.name} · {timezone}
            </span>
          </footer>
        </main>
      </div>
      <Composer
        key={`${composer}-${editId}`}
        open={composer}
        onOpenChange={setComposer}
        item={composerSnapshot}
        brand={state.brand}
        demo={demo}
        urls={urls}
        busy={busy}
        command={command}
        notify={setToast}
        error={error}
      />
      <Modal
        error={error}
        open={!!reviewId}
        onOpenChange={(v) => {
          if (!v) setReviewId(null);
        }}
        title="A thoughtful second look"
        description="Review the image, caption, and version before approving."
        wide
      >
        {review && (
          <div className="review-layout">
            <div className="review-image">
              {image(review) ? (
                <img src={image(review)} alt={review.title} />
              ) : (
                <ImagePlus size={40} />
              )}
            </div>
            <div className="review-detail">
              <div className="platform-label">
                <PlatformIcon platform={review.platform} />
                {label(review.platform)}
                <Badge value={review.status} />
              </div>
              <h2>{review.title}</h2>
              <p className="caption-text">{review.versions.at(-1)?.caption}</p>
              <small className="subtle">
                Version {review.versions.length} ·{" "}
                {review.versions.at(-1)?.author}
              </small>
              <details className="version-history">
                <summary>Version history ({review.versions.length})</summary>
                {[...review.versions].reverse().map((v, i) => (
                  <div key={v.id}>
                    <strong>
                      Version {review.versions.length - i} · {v.author}
                    </strong>
                    <small>{date(v.createdAt)}</small>
                    <p>{v.caption}</p>
                    <span>
                      {v.asset
                        ? `${v.asset.width} × ${v.asset.height} image`
                        : "No image"}
                    </span>
                  </div>
                ))}
              </details>
              <details className="version-history">
                <summary>Review decisions</summary>
                {(state.approvals || [])
                  .filter((a) => a.contentId === review.id)
                  .map((a) => (
                    <div key={a.id}>
                      <strong>
                        {a.decision === "approve"
                          ? "Approved"
                          : "Changes requested"}{" "}
                        · {a.reviewer}
                      </strong>
                      <small>
                        Version{" "}
                        {review.versions.findIndex(
                          (v) => v.id === a.versionId,
                        ) + 1}{" "}
                        · {date(a.at)}
                      </small>
                      {a.comment && <p>{a.comment}</p>}
                    </div>
                  ))}
                {!(state.approvals || []).some(
                  (a) => a.contentId === review.id,
                ) && <p>No recorded decisions for this content.</p>}
              </details>
              {review.comments.map((c, i) => (
                <blockquote key={i}>
                  <strong>{c.author}</strong>
                  <p>{c.text}</p>
                </blockquote>
              ))}
              {review.status === "in_review" && canApprove(user.role) && (
                <>
                  <label>
                    Feedback
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="A note for your teammate…"
                    />
                  </label>
                  <div className="form-actions">
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={async () => {
                        if (
                          await command({
                            type: "review",
                            expectedVersion: review!.versions.at(-1)!.id,
                            id: review.id,
                            decision: "changes",
                            comment,
                          })
                        ) {
                          setReviewId(null);
                          setToast("Changes requested.");
                        }
                      }}
                    >
                      Request changes
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={async () => {
                        if (
                          await command({
                            type: "review",
                            expectedVersion: review!.versions.at(-1)!.id,
                            id: review.id,
                            decision: "approve",
                            comment,
                          })
                        ) {
                          setReviewId(null);
                          setToast("This version is approved.");
                        }
                      }}
                    >
                      <Check size={16} />
                      Approve version
                    </Button>
                  </div>
                </>
              )}
              {review.status === "approved" && canApprove(user.role) && (
                <Button
                  onClick={() => {
                    setReviewId(null);
                    openSchedule(review.id);
                    setMoveId(null);
                    setWhen(
                      localDateTime(
                        new Date(Date.now() + 86400000).toISOString(),
                        timezone,
                      ),
                    );
                  }}
                >
                  <CalendarDays size={16} />
                  Schedule post
                </Button>
              )}
              <button
                className="text-link"
                onClick={() => {
                  setReviewId(null);
                  compose(review.id);
                }}
              >
                Open in studio <ArrowUpRight size={14} />
              </button>
            </div>
          </div>
        )}
      </Modal>
      <Modal
        error={error}
        open={!!scheduleId || !!moveId}
        onOpenChange={(v) => {
          if (!v) {
            setScheduleId(null);
            setMoveId(null);
          }
        }}
        title={moveId ? "Move this moment" : "Give your post its moment"}
        description={`Choose a date and time in ${timezone}.`}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const enteredTime = String(
                new FormData(e.currentTarget).get("when") || "",
              );
              const at = zonedToUtc(enteredTime, timezone);
              const ok = await command(
                moveId
                  ? { type: "reschedule", id: moveId, scheduledAt: at }
                  : {
                      type: "schedule",
                      id: scheduleId!,
                      expectedVersion: scheduleBase.current,
                      scheduledAt: at,
                    },
              );
              if (ok) {
                setScheduleId(null);
                setMoveId(null);
                setToast(
                  demo
                    ? "Demo schedule saved. No real publication will occur."
                    : "Post scheduled.",
                );
              }
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <label>
            Publication time
            <input
              type="datetime-local"
              name="when"
              required
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
          </label>
          <div className="info-note">
            <Clock3 size={18} />
            <span>
              Only the approved version will publish. Editing its content
              cancels the schedule.
            </span>
          </div>
          <div className="form-actions">
            {moveId && (
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={async () => {
                  if (await command({ type: "cancel", id: moveId })) {
                    setMoveId(null);
                    setToast("Publication cancelled.");
                  }
                }}
              >
                Cancel publication
              </Button>
            )}
            <Button type="submit" disabled={busy}>
              <CalendarDays size={16} />
              {moveId ? "Save new time" : "Schedule post"}
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        error={error}
        open={invite}
        onOpenChange={setInvite}
        title="A little more teamwork"
        description="Invite a teammate to your private workspace."
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (demo) {
              setToast(
                "Demo only. Invitations are available after Supabase is configured.",
              );
              setInvite(false);
              return;
            }
            try {
              setBusy(true);
              await json("/api/team", {
                action: "invite",
                email: inviteEmail,
                role: inviteRole,
              });
              setMembers((await json("/api/team")).members);
              setInvite(false);
              setToast("Invitation sent.");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Email address
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="teammate@yourbrand.com"
            />
          </label>
          <label>
            Role
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as Actor["role"])}
            >
              <option value="creator">Creator</option>
              <option value="approver">Approver</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <div className="form-actions">
            <Button disabled={busy} type="submit">
              Send invitation <ArrowRight size={15} />
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        error={error}
        open={passwordSetup}
        onOpenChange={setPasswordSetup}
        title="Welcome to your workspace"
        description="Set a password of at least 12 characters."
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await json("/api/password", { password: newPassword });
              setPasswordSetup(false);
              history.replaceState(null, "", "/");
              setToast("Your password is ready.");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <label>
            New password
            <input
              type="password"
              minLength={12}
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </label>
          <Button type="submit">Save password</Button>
        </form>
      </Modal>
      <Modal
        error={error}
        open={!!reconcile}
        onOpenChange={(v) => {
          if (!v) setReconcile(null);
        }}
        title="Verify a published post"
        description="Check the social account and enter the ID of the matching post. The server verifies the owner and exact caption."
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await command({ type: "reconcile", id: reconcile!, remoteId })
            ) {
              setReconcile(null);
              setToast("Publication reconciled.");
            }
          }}
        >
          <label>
            Remote post ID
            <input
              value={remoteId}
              onChange={(e) => setRemoteId(e.target.value)}
              required
              pattern="[0-9_]+"
            />
          </label>
          <Button type="submit" disabled={busy}>
            Verify and reconcile
          </Button>
        </form>
        {user.role === "admin" && (
          <div className="info-note">
            <div>
              <p>
                If you investigated the account and confirmed no post exists,
                record that decision separately.
              </p>
              <Button
                variant="secondary"
                onClick={() => {
                  setAbsenceId(reconcile);
                  setReconcile(null);
                  setAbsenceNote("");
                  setAbsenceConfirmed(false);
                }}
              >
                Record confirmed absence
              </Button>
            </div>
          </div>
        )}
      </Modal>
      <Modal
        error={error}
        open={!!absenceId}
        onOpenChange={(v) => {
          if (!v) setAbsenceId(null);
        }}
        title="Resolve an absent post"
        description="Investigate the original social account and provider logs first. Wait at least ten minutes after dispatch. This never republishes automatically."
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await command({
                type: "resolve_absent",
                id: absenceId!,
                confirmedAbsent: true,
                comment: absenceNote,
              })
            ) {
              setAbsenceId(null);
              setToast(
                "Absence recorded. A new publication can be reviewed and scheduled.",
              );
            }
          }}
        >
          <label>
            Investigation notes
            <textarea
              required
              minLength={20}
              maxLength={2000}
              value={absenceNote}
              onChange={(e) => setAbsenceNote(e.target.value)}
            />
          </label>
          <label>
            <input
              type="checkbox"
              required
              checked={absenceConfirmed}
              onChange={(e) => setAbsenceConfirmed(e.target.checked)}
            />{" "}
            I checked the original account and confirmed no matching post
            exists.
          </label>
          <Button type="submit" disabled={busy || !absenceConfirmed}>
            Record decision
          </Button>
        </form>
      </Modal>
      {toast && (
        <div className="toast" role="status">
          <span>
            <Check size={16} />
          </span>
          {toast}
          <button
            aria-label="Dismiss notification"
            className="icon-button"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
function ContentCard({
  item,
  image,
  onOpen,
  footer,
}: {
  item: Content;
  image?: string;
  onOpen: () => void;
  footer?: React.ReactNode;
}) {
  return (
    <article className="content-card">
      <button
        className="card-image"
        onClick={onOpen}
        aria-label={`Open ${item.title}`}
      >
        {image ? (
          <img src={image} alt={item.title} />
        ) : (
          <div className="no-image">
            <ImagePlus size={30} />
            <span>Your image goes here</span>
          </div>
        )}
        <span className={cn("platform-mark", item.platform)}>
          <PlatformIcon platform={item.platform} />
        </span>
        <span className="image-menu">
          <MoreHorizontal size={19} />
        </span>
      </button>
      <div className="card-copy">
        <div className="card-meta">
          <Badge value={item.status} />
          <small>v{item.versions.length}</small>
        </div>
        <button className="card-title" onClick={onOpen}>
          {item.title}
        </button>
        <p>
          {item.versions.at(-1)?.caption || "A little room for your next idea."}
        </p>
        <div className="card-bottom">
          <span className="mini-avatar">
            {item.versions.at(-1)?.author[0].toUpperCase()}
          </span>
          <small>{label(item.platform)} · Single image</small>
        </div>
      </div>
      {footer && <div className="card-actions">{footer}</div>}
    </article>
  );
}
function Empty({ text, action }: { text: string; action?: () => void }) {
  return (
    <div className="empty-state">
      <span className="empty-flower">
        <Flower2 size={34} />
      </span>
      <h3>{text}</h3>
      <p>Good content starts with one small idea.</p>
      {action && (
        <Button variant="secondary" onClick={action}>
          <Plus size={15} />
          Create content
        </Button>
      )}
    </div>
  );
}
function MiniCalendar({
  month,
  year,
  timezone,
}: {
  month: number;
  year: number;
  timezone: string;
}) {
  const today = Number(
    new Intl.DateTimeFormat("en", {
      timeZone: timezone,
      day: "numeric",
    }).format(new Date()),
  );
  return (
    <div className="mini-calendar">
      <div className="mini-month">
        {new Date(year, month).toLocaleDateString("en", {
          month: "long",
          year: "numeric",
        })}
      </div>
      <div className="mini-days">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <strong key={`h${i}`}>{d}</strong>
        ))}
        {Array.from({ length: 42 }, (_, i) => {
          const offset = (new Date(year, month, 1).getDay() + 6) % 7,
            d = i - offset + 1;
          return (
            <span key={i} className={d === today ? "today" : ""}>
              {d > 0 && d <= new Date(year, month + 1, 0).getDate() ? d : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}
function Login({
  error,
  onLogin,
}: {
  error: string;
  onLogin: () => Promise<void>;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [issue, setIssue] = useState(error),
    [busy, setBusy] = useState(false);
  return (
    <div className="login-page">
      <div className="login-art">
        <Flower2 size={52} />
        <h1>
          A little structure.
          <br />
          More creativity.
        </h1>
        <p>A thoughtful home for your team’s social content.</p>
        <img
          src="/samples/ceramics.svg"
          alt="Ceramic pieces on a warm studio background"
        />
      </div>
      <form
        className="login-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await json("/api/auth", { email, password });
            await onLogin();
          } catch (e) {
            setIssue((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <span className="logo">
          <Flower2 size={25} />
        </span>
        <div className="eyebrow">WELCOME TO BLOOM</div>
        <h2>
          Your next good idea
          <br />
          starts here.
        </h2>
        <p>Sign in with your invited team account.</p>
        {issue && (
          <div className="error-banner" role="alert">
            {issue}
          </div>
        )}
        <label>
          Email address
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <Button type="submit" disabled={busy}>
          {busy ? (
            <Loader2 className="spin" size={16} />
          ) : (
            <ArrowRight size={16} />
          )}
          Sign in
        </Button>
        <small>
          Need access? Ask your workspace administrator for an invitation.
        </small>
      </form>
    </div>
  );
}
function BrandForm({
  brand,
  disabled,
  onSave,
}: {
  brand: Brand;
  disabled: boolean;
  onSave: (b: Brand) => void;
}) {
  const [draft, setDraft] = useState(brand);
  return (
    <form
      className="brand-layout"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
      }}
    >
      <section className="panel settings-panel">
        <h2>The heart of your brand</h2>
        <p>Give your team and AI a shared starting point.</p>
        {(
          [
            {
              key: "name",
              name: "Brand name",
              hint: "Your business or studio name",
              rows: 0,
            },
            {
              key: "description",
              name: "What you do",
              hint: "Describe your products, services, and purpose.",
              rows: 3,
            },
            {
              key: "audience",
              name: "Who you’re speaking to",
              hint: "Who are your customers? What do they care about?",
              rows: 3,
            },
            {
              key: "tone",
              name: "How your brand sounds",
              hint: "Warm, thoughtful, clear…",
              rows: 2,
            },
          ] as const
        ).map((f) => (
          <label key={f.key}>
            {f.name}
            {f.rows ? (
              <textarea
                rows={f.rows}
                disabled={disabled}
                value={draft[f.key]}
                placeholder={f.hint}
                onChange={(e) =>
                  setDraft({ ...draft, [f.key]: e.target.value })
                }
              />
            ) : (
              <input
                required
                disabled={disabled}
                value={draft[f.key]}
                placeholder={f.hint}
                onChange={(e) =>
                  setDraft({ ...draft, [f.key]: e.target.value })
                }
              />
            )}
          </label>
        ))}
      </section>
      <div>
        <section className="panel settings-panel">
          <h2>A little clarity goes a long way.</h2>
          <p>Keep the facts grounded and the voice consistent.</p>
          <label>
            Verified product and business facts
            <textarea
              rows={5}
              disabled={disabled}
              value={draft.facts}
              onChange={(e) => setDraft({ ...draft, facts: e.target.value })}
              placeholder="Only add claims you can support."
            />
          </label>
          <label>
            Claims and language to avoid
            <textarea
              rows={4}
              disabled={disabled}
              value={draft.prohibited}
              onChange={(e) =>
                setDraft({ ...draft, prohibited: e.target.value })
              }
            />
          </label>
          <label>
            Workspace timezone
            <input
              required
              disabled={disabled}
              value={draft.timezone}
              onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
            />
          </label>
          <div className="info-note">
            <ShieldCheck size={18} />
            <span>
              AI drafts use these details. Human review is still required before
              publishing.
            </span>
          </div>
          <Button type="submit" disabled={disabled}>
            <Check size={16} />
            Save brand settings
          </Button>
        </section>
      </div>
    </form>
  );
}
function Composer({
  open,
  onOpenChange,
  item,
  brand,
  demo,
  urls,
  busy,
  command,
  notify,
  error,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item?: Content;
  brand: Brand;
  demo: boolean;
  urls: Record<string, string>;
  busy: boolean;
  command: (c: Command) => Promise<boolean>;
  notify: (s: string) => void;
  error: string;
}) {
  const [baseVersion] = useState(item?.versions.at(-1)?.id);
  const [title, setTitle] = useState(item?.title || ""),
    [brief, setBrief] = useState(item?.brief || ""),
    [platform, setPlatform] = useState<Platform>(item?.platform || "instagram"),
    [caption, setCaption] = useState(item?.versions.at(-1)?.caption || ""),
    [asset, setAsset] = useState<Asset | null>(
      item?.versions.at(-1)?.asset || null,
    ),
    [options, setOptions] = useState<Option[]>([]),
    [working, setWorking] = useState(false),
    [problem, setProblem] = useState("");
  async function upload(file: File) {
    setWorking(true);
    setProblem("");
    try {
      if (file.size > MAX_SOURCE_BYTES)
        throw new Error(`Choose an image under ${SOURCE_LIMIT_LABEL}.`);
      if (demo) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
          throw new Error("Choose a JPEG, PNG, or WebP image.");
        const bitmap = await createImageBitmap(file),
          canvas = document.createElement("canvas");
        canvas.width = Math.min(1440, bitmap.width);
        canvas.height = Math.round(
          (bitmap.height * canvas.width) / bitmap.width,
        );
        canvas
          .getContext("2d")!
          .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const url = canvas.toDataURL("image/jpeg", 0.85);
        setAsset({
          id: crypto.randomUUID(),
          path: "demo/upload.jpg",
          url,
          width: canvas.width,
          height: canvas.height,
          bytes: Math.round(url.length * 0.75),
          mime: "image/jpeg",
        });
        bitmap.close();
      } else {
        const body = new FormData();
        body.append("file", file);
        const r = await fetch("/api/upload", { method: "POST", body });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setAsset(d.asset);
      }
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  async function generate() {
    setWorking(true);
    setProblem("");
    try {
      if (brief.trim().length < 5)
        throw new Error("Add a brief of at least five characters.");
      if (demo) {
        setOptions(
          [0, 1, 2].map((n) => ({
            platform,
            caption: [
              `${title || "A little everyday inspiration"}.\n\n${brief}\n\nDiscover something that feels like you.`,
              `${brand.name}, in the everyday.\n\n${brief}\n\nTake a closer look at the collection.`,
              `Small details. Thoughtful choices.\n\n${brief}\n\nFind your next favourite with ${brand.name}.`,
            ][n],
            hashtags: ["#ThoughtfulLiving", "#EverydayDesign"],
            claimsToVerify: [
              "Sample template only. Verify every product detail and offer.",
            ],
          })),
        );
      } else {
        const data = await json("/api/generate", {
          brief,
          platforms: [platform],
          ...(caption ? { rewrite: caption } : {}),
        });
        setOptions(data.options);
      }
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  async function save(submit = false) {
    if (!title.trim() || !brief.trim()) {
      setProblem("Add a title and a brief.");
      return;
    }
    if (submit && (!asset || !caption.trim())) {
      setProblem("Add an image and caption before requesting review.");
      return;
    }
    let id = item?.id;
    const ok = await command(
      item
        ? {
            type: "edit",
            id: item.id,
            expectedVersion: baseVersion!,
            submitForReview: submit,
            caption,
            asset,
          }
        : { type: "create", title, brief, platform, caption, asset },
    );
    if (!ok) {
      setProblem(
        "Could not save this change. Check the workspace error message.",
      );
      return;
    }
    if (ok) {
      onOpenChange(false);
      notify(submit && id ? "Sent for review." : "Draft saved.");
    }
  }
  const url = asset && (urls[asset.id] || asset.url);
  return (
    <Modal
      error={error}
      open={open}
      onOpenChange={onOpenChange}
      title={item ? "A little fine-tuning" : "Start with a little spark"}
      description={
        item
          ? `Version ${item.versions.length} · Editing content cancels its approval and scheduled publication.`
          : "Create a post that sounds like your brand."
      }
      wide
    >
      <div className="composer-layout">
        <div className="composer-form">
          {problem && (
            <div className="error-banner" role="alert">
              {problem}
            </div>
          )}
          <div className="form-row">
            <label>
              Content title
              <input
                required
                maxLength={150}
                disabled={!!item}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="A name for this little idea"
              />
            </label>
            <label>
              Channel
              <select
                value={platform}
                disabled={!!item}
                onChange={(e) => {
                  setPlatform(e.target.value as Platform);
                  setOptions([]);
                }}
              >
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
              </select>
            </label>
          </div>
          <label>
            The brief
            <textarea
              rows={3}
              disabled={!!item}
              maxLength={4000}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="What are we sharing? Add the message, product details, and call to action."
            />
          </label>
          <div className="generate-row">
            <Button variant="secondary" disabled={working} onClick={generate}>
              {working ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <Sparkles size={16} />
              )}{" "}
              {demo
                ? "Get sample captions"
                : caption
                  ? "Rewrite with AI"
                  : "Generate with AI"}
            </Button>
            <small>
              {demo
                ? "Local templates · No AI service used"
                : "3 options · Your brand voice"}
            </small>
          </div>
          {options.length > 0 && (
            <div className="caption-options">
              {options.map((o, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setCaption(assembleCaption(o.caption, o.hashtags));
                    notify(
                      "Caption added. Review its details before submitting.",
                    );
                  }}
                >
                  <span>
                    OPTION {i + 1} <Plus size={13} />
                  </span>
                  <p>{o.caption}</p>
                  {o.claimsToVerify.length > 0 && (
                    <small>
                      <AlertCircle size={13} />
                      {o.claimsToVerify.join(" ")}
                    </small>
                  )}
                </button>
              ))}
            </div>
          )}
          <label>
            Your caption
            <textarea
              rows={7}
              maxLength={2200}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="A few words that make a connection…"
            />
            <span className="input-counter">{caption.length}/2,200</span>
          </label>
          <label className="upload-area">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={working}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
              }}
            />
            <ImagePlus size={22} />
            <strong>
              {asset ? "Replace your image" : "Add a little visual magic"}
            </strong>
            <span>JPEG, PNG or WebP · Up to {SOURCE_LIMIT_LABEL}</span>
            {asset && (
              <small>
                {asset.width} × {asset.height} · Converted to JPEG
              </small>
            )}
          </label>
          <div className="composer-footer">
            <Button
              variant="secondary"
              disabled={busy || working}
              onClick={() => save(false)}
            >
              Save draft
            </Button>
            {item ? (
              <Button disabled={busy || working} onClick={() => save(true)}>
                Send for review <ArrowRight size={15} />
              </Button>
            ) : (
              <span className="subtle">
                Save your draft, then send it for review.
              </span>
            )}
          </div>
        </div>
        <div className="composer-preview">
          <div className="preview-label">
            <span>POST PREVIEW</span>
            <PlatformIcon platform={platform} />
          </div>
          <div className="social-preview">
            <div className="social-head">
              <span className="tiny-logo">
                <Flower2 size={18} />
              </span>
              <span>
                <strong>{brand.name}</strong>
                <small>
                  {platform === "facebook"
                    ? "Just now · Public"
                    : "Post preview"}
                </small>
              </span>
              <MoreHorizontal size={18} />
            </div>
            {url ? (
              <img
                className="preview-image"
                src={url}
                alt="Selected marketing image"
              />
            ) : (
              <div className="preview-placeholder">
                <Flower2 size={43} />
                <span>
                  Make a little room
                  <br />
                  for your next idea.
                </span>
              </div>
            )}
            <div className="social-body">
              <div className="social-icons">
                <span>♡</span>
                <Send size={19} />
                <span className="bookmark">♧</span>
              </div>
              <p>
                <strong>{brand.name}</strong>{" "}
                {caption || "Your words go here. Make them feel like you."}
              </p>
            </div>
          </div>
          <div className="preview-note">
            <ShieldCheck size={16} />
            <p>Nothing goes live without a human review. That’s a promise.</p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
