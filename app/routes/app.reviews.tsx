import { useState } from "react";
import type { CSSProperties } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs, ShouldRevalidateFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useNavigation, useSearchParams, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { getShopConfig, saveShopConfig } from "../loyalty.server";
import {
  getReviewStats,
  getRatingCounts,
  getReviewsPage,
  approveReview,
  rejectReview,
  setAdminReply,
  rejectVideo,
  flagReview,
  type ReviewRow,
} from "../reviews.server";

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url         = new URL(request.url);
  const tab         = url.searchParams.get("tab")    ?? "reviews";
  const status      = url.searchParams.get("status") ?? "all";
  const type        = url.searchParams.get("type")   ?? "all";
  const ratingParam = url.searchParams.get("rating");
  const rating      = ratingParam ? parseInt(ratingParam) : undefined;
  const cursor      = url.searchParams.get("cursor") ?? undefined;
  const search      = url.searchParams.get("search") ?? "";

  const [stats, ratingCounts, reviewsData, config] = await Promise.all([
    getReviewStats(shop),
    getRatingCounts(shop),
    getReviewsPage(shop, { status, cursor, search, rating, type }),
    getShopConfig(shop),
  ]);

  return {
    tab, status, type, rating: rating ?? null, cursor: cursor ?? null, search,
    stats, ratingCounts,
    reviews:        reviewsData.reviews,
    reviewTotal:    reviewsData.total,
    nextCursor:     reviewsData.nextCursor,
    hasMore:        reviewsData.hasMore,
    reviewPageSize: reviewsData.pageSize,
    reviewSettings: config.reviewSettings,
    earningRules:   config.earningRules,
  };
};

// ─── Action ───────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop        = session.shop;
  const formData    = await request.formData();
  const intent      = formData.get("intent") as string;

  switch (intent) {
    case "approve":
      await approveReview(formData.get("reviewId") as string, shop);
      return { ok: true };
    case "reject":
      await rejectReview(formData.get("reviewId") as string);
      return { ok: true };
    case "reply":
      await setAdminReply(formData.get("reviewId") as string, formData.get("reply") as string);
      return { ok: true };
    case "reject-video":
      await rejectVideo(formData.get("videoId") as string);
      return { ok: true };
    case "flag":
      await flagReview(formData.get("reviewId") as string);
      return { ok: true };
    case "save-settings": {
      const flagKeywords      = ((formData.get("flagKeywords") as string) ?? "")
        .split(",").map((k) => k.trim()).filter(Boolean);
      const lowStarThreshold  = Math.min(5, Math.max(1, parseInt(formData.get("lowStarThreshold") as string) || 2));
      const textReviewPoints  = Math.max(0, parseInt(formData.get("textReviewPoints")  as string) || 0);
      const videoReviewPoints = Math.max(0, parseInt(formData.get("videoReviewPoints") as string) || 0);
      await saveShopConfig(shop, {
        reviewSettings: { flagKeywords, lowStarThreshold },
        earningRules:   { textReviewPoints, videoReviewPoints },
      });
      return { ok: true };
    }
    default:
      return { ok: false, error: "Unknown intent" };
  }
};

// ─── Revalidation — skip expensive queries when only filter params change ─────
//
// stats, ratingCounts, and shopConfig don't change when you click a sidebar
// filter. Only re-run them when an action (approve/reject/flag) just ran,
// or when the tab changes to "settings".

export function shouldRevalidate({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  // Always revalidate after a mutation (approve, reject, flag, reply, etc.)
  if (formMethod && formMethod.toUpperCase() !== "GET") return true;

  const filterKeys = ["status", "type", "rating", "cursor", "search"];
  const changed    = filterKeys.some(
    (k) => currentUrl.searchParams.get(k) !== nextUrl.searchParams.get(k)
  );

  // Filter-only change: revalidate (we need fresh reviews) but this tells React
  // Router to proceed with the navigation immediately rather than waiting.
  if (changed) return true;

  return defaultShouldRevalidate;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stars(n: number, size = 15) {
  return (
    <span style={{ color: "#f59e0b", fontSize: size, letterSpacing: 1 }}>
      {"★".repeat(n)}<span style={{ color: "#e5e7eb" }}>{"★".repeat(5 - n)}</span>
    </span>
  );
}

function customerLabel(r: ReviewRow) {
  if (r.customer) {
    const name = [r.customer.firstName, r.customer.lastName].filter(Boolean).join(" ");
    return name || r.customer.email;
  }
  return r.reviewerName || "Anonymous";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS: Record<string, { bg: string; color: string; label: string }> = {
  pending:  { bg: "#fff7ed", color: "#c2410c", label: "Pending" },
  flagged:  { bg: "#fef2f2", color: "#b91c1c", label: "Flagged" },
  approved: { bg: "#f0fdf4", color: "#15803d", label: "Published" },
  rejected: { bg: "#f3f4f6", color: "#6b7280", label: "Rejected" },
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  shell: {
    display:             "grid",
    gridTemplateColumns: "260px 1fr",
    minHeight:           "calc(100vh - 56px)",
    alignItems:          "start",
    background:          "#f9fafb",
  } satisfies CSSProperties,

  sidebar: {
    borderRight:  "1px solid #e5e7eb",
    background:   "#ffffff",
    position:     "sticky" as const,
    top:          0,
    minHeight:    "calc(100vh - 56px)",
    overflowY:    "auto" as const,
  } satisfies CSSProperties,

  sideBlock: (last = false): CSSProperties => ({
    padding:      "16px 14px",
    borderBottom: last ? "none" : "1px solid #f3f4f6",
  }),

  sideHeading: {
    fontSize:      "10px",
    fontWeight:    700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    color:         "#9ca3af",
    marginBottom:  "10px",
    paddingLeft:   "6px",
  } satisfies CSSProperties,

  filterBtn: (active: boolean): CSSProperties => ({
    display:        "flex",
    justifyContent: "space-between",
    alignItems:     "center",
    width:          "100%",
    padding:        "7px 10px",
    border:         "none",
    borderRadius:   "6px",
    background:     active ? "#eff6ff" : "transparent",
    borderLeft:     active ? "3px solid #2563eb" : "3px solid transparent",
    color:          active ? "#1d4ed8" : "#374151",
    fontWeight:     active ? 600 : 400,
    fontSize:       "13px",
    cursor:         "pointer",
    textAlign:      "left" as const,
    marginBottom:   "2px",
    transition:     "background 0.1s",
  }),

  pill: (active: boolean): CSSProperties => ({
    padding:     "4px 12px",
    borderRadius: "999px",
    border:      "1px solid",
    borderColor: active ? "#2563eb" : "#d1d5db",
    background:  active ? "#2563eb" : "transparent",
    color:       active ? "#fff" : "#6b7280",
    fontSize:    "12px",
    fontWeight:  active ? 600 : 400,
    cursor:      "pointer",
  }),

  content: {
    padding:   "20px 24px",
    minWidth:  0,
  } satisfies CSSProperties,

  card: {
    background:   "#ffffff",
    border:       "1px solid #e5e7eb",
    borderRadius: "12px",
    marginBottom: "12px",
    overflow:     "hidden",
  } satisfies CSSProperties,

  cardBody: {
    padding: "18px 20px",
    display: "grid",
    gridTemplateColumns: "1fr 160px",
    gap: "20px",
    alignItems: "start",
  } satisfies CSSProperties,

  cardFooter: {
    padding:        "12px 20px",
    borderTop:      "1px solid #f3f4f6",
    background:     "#fafafa",
    display:        "flex",
    gap:            "6px",
    alignItems:     "center",
    flexWrap:       "wrap" as const,
  } satisfies CSSProperties,

  tag: (bg: string, color: string): CSSProperties => ({
    display:      "inline-flex",
    padding:      "2px 10px",
    borderRadius: "999px",
    background:   bg,
    color,
    fontSize:     "11px",
    fontWeight:   600,
  }),

  actionBtn: (variant: "primary" | "danger" | "default"): CSSProperties => ({
    padding:      "6px 14px",
    borderRadius: "6px",
    border:       "1px solid",
    fontSize:     "12px",
    fontWeight:   600,
    cursor:       "pointer",
    background:   variant === "primary" ? "#2563eb"
                : variant === "danger"  ? "#fef2f2"
                : "#ffffff",
    color:        variant === "primary" ? "#fff"
                : variant === "danger"  ? "#b91c1c"
                : "#374151",
    borderColor:  variant === "primary" ? "#2563eb"
                : variant === "danger"  ? "#fecaca"
                : "#d1d5db",
  }),
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function Reviews() {
  const data            = useLoaderData<typeof loader>();
  const navigate        = useNavigate();
  const navigation      = useNavigation();
  const [searchParams]  = useSearchParams();
  const actionFetcher   = useFetcher();
  const settingsFetcher = useFetcher();

  const isFiltering = navigation.state === "loading"
    && navigation.location?.pathname === "/app/reviews";

  const [search,       setSearch]       = useState(data.search);
  const [replyingTo,   setReplyingTo]   = useState<string | null>(null);
  const [replyText,    setReplyText]    = useState("");
  const [flagKeywords, setFlagKeywords] = useState(data.reviewSettings.flagKeywords.join(", "));
  const [lowStarLimit, setLowStarLimit] = useState(String(data.reviewSettings.lowStarThreshold));
  const [textPoints,   setTextPoints]   = useState(String(data.earningRules.textReviewPoints));
  const [videoPoints,  setVideoPoints]  = useState(String(data.earningRules.videoReviewPoints));

  // Cursor history for ← Previous navigation.
  // Stored in state (not URL) — resets when filters change, which is correct.
  const [cursorStack, setCursorStack] = useState<string[]>([]);

  const { tab, status, type, rating, stats, ratingCounts,
          reviews, reviewTotal, nextCursor, hasMore } = data;
  const maxRatingCount = Math.max(1, ...Object.values(ratingCounts));
  const isFirstPage    = !data.cursor;
  const hasPrev        = cursorStack.length > 0;

  // nav() is used for filter changes — always resets cursor history.
  function nav(updates: Record<string, string | null>) {
    const p = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(updates)) {
      if (v == null) p.delete(k); else p.set(k, v);
    }
    p.delete("cursor");
    setCursorStack([]);
    navigate(`?${p.toString()}`);
  }

  function goNext() {
    if (!nextCursor) return;
    const currentCursor = searchParams.get("cursor") ?? "";
    setCursorStack((prev) => [...prev, currentCursor]);
    const p = new URLSearchParams(searchParams);
    p.set("cursor", nextCursor);
    navigate(`?${p.toString()}`);
  }

  function goPrev() {
    const stack = [...cursorStack];
    const prevCursor = stack.pop() ?? "";
    setCursorStack(stack);
    const p = new URLSearchParams(searchParams);
    if (prevCursor) p.set("cursor", prevCursor);
    else p.delete("cursor");
    navigate(`?${p.toString()}`);
  }

  function submitAction(fields: Record<string, string>) {
    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => fd.set(k, v));
    actionFetcher.submit(fd, { method: "post" });
  }

  const hasActiveFilter = search || status !== "all" || type !== "all" || rating;

  // Read pending URL params so sidebar highlights update instantly on click
  const pendingParams   = isFiltering && navigation.location
    ? new URLSearchParams(navigation.location.search)
    : null;
  const activeStatus = pendingParams?.get("status") ?? status;
  const activeType   = pendingParams?.get("type")   ?? type;
  const activeRating = pendingParams?.get("rating")  ? parseInt(pendingParams.get("rating")!) : rating;

  return (
    <s-page heading="Reviews">

      {/* ── Tab bar ── */}
      <s-section>
        <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb", margin: "-16px -16px 0", overflowX: "auto" }}>
          {[
            { key: "reviews",  label: `Reviews (${reviewTotal})` },
            { key: "settings", label: "Settings" },
          ].map((t) => (
            <button key={t.key} onClick={() => nav({ tab: t.key })} style={{
              padding: "13px 18px", border: "none", background: "none", cursor: "pointer",
              borderBottom: tab === t.key ? "2px solid #111827" : "2px solid transparent",
              color: tab === t.key ? "#111827" : "#6b7280",
              fontWeight: tab === t.key ? 700 : 500, fontSize: "13px", whiteSpace: "nowrap",
            }}>
              {t.label}
            </button>
          ))}
        </div>
      </s-section>

      {/* ════════════════════ REVIEWS TAB ════════════════════ */}
      {tab === "reviews" && (
        <div style={S.shell}>

          {/* ── Sidebar ──────────────────────────────────────── */}
          <aside style={S.sidebar}>

            {/* Stat tiles */}
            <div style={S.sideBlock()}>
              <div style={S.sideHeading}>Needs action</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "10px" }}>
                {[
                  { label: "Pending",  value: stats.pending, bg: "#fff7ed", color: "#c2410c" },
                  { label: "Flagged",  value: stats.flagged, bg: "#fef2f2", color: "#b91c1c" },
                ].map((s) => (
                  <div key={s.label} style={{ background: s.bg, borderRadius: "8px", padding: "10px 12px" }}>
                    <div style={{ fontSize: "22px", fontWeight: 800, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: "11px", color: s.color, opacity: 0.8, fontWeight: 600 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: "#f9fafb", borderRadius: "8px", padding: "10px 12px" }}>
                <div style={{ fontSize: "22px", fontWeight: 800, color: "#111827" }}>{reviewTotal}</div>
                <div style={{ fontSize: "11px", color: "#6b7280", fontWeight: 600 }}>Total reviews</div>
              </div>
            </div>

            {/* Status filter */}
            <div style={S.sideBlock()}>
              <div style={S.sideHeading}>Status</div>
              {[
                { label: "All reviews", key: "all" },
                { label: "Pending",     key: "pending" },
                { label: "Published",   key: "approved" },
                { label: "Rejected",    key: "rejected" },
                { label: "Flagged",     key: "flagged" },
              ].map((item) => (
                <button key={item.key} style={S.filterBtn(activeStatus === item.key)}
                  onClick={() => nav({ tab: "reviews", status: item.key, page: null })}>
                  {item.label}
                </button>
              ))}
            </div>

            {/* Content type */}
            <div style={S.sideBlock()}>
              <div style={S.sideHeading}>Content type</div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {[
                  { label: "All",     key: "all" },
                  { label: "Product", key: "product" },
                  { label: "Site",    key: "site" },
                ].map((item) => (
                  <button key={item.key} style={S.pill(activeType === item.key)}
                    onClick={() => nav({ tab: "reviews", type: item.key, page: null })}>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Star rating with distribution bars */}
            <div style={S.sideBlock(true)}>
              <div style={S.sideHeading}>Star rating</div>
              {[5, 4, 3, 2, 1].map((n) => {
                const count = ratingCounts[n] ?? 0;
                const pct   = Math.round((count / maxRatingCount) * 100);
                return (
                  <button key={n} style={S.filterBtn(activeRating === n)}
                    onClick={() => nav({ tab: "reviews", rating: activeRating === n ? null : String(n), page: null })}>
                    <span style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1 }}>
                      <span style={{ color: "#f59e0b", fontSize: "12px", letterSpacing: 1, whiteSpace: "nowrap" }}>
                        {"★".repeat(n)}<span style={{ color: "#e5e7eb" }}>{"★".repeat(5 - n)}</span>
                      </span>
                      <span style={{
                        flex: 1, height: "4px", borderRadius: "2px",
                        background: `linear-gradient(to right, ${rating === n ? "#2563eb" : "#d1fae5"} ${pct}%, #f3f4f6 ${pct}%)`,
                      }} />
                    </span>
                    <span style={{ fontSize: "11px", color: "#9ca3af", marginLeft: "6px", fontWeight: 500 }}>{count}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* ── Main content ─────────────────────────────────── */}
          <div style={{ ...S.content, position: "relative" as const }}>

            {/* Search + filter chips */}
            <div style={{ marginBottom: "16px" }}>
              <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
                <div style={{ flex: 1, position: "relative" as const }}>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") nav({ tab: "reviews", search: search || null, page: null }); }}
                    placeholder="Search by reviewer, title, or body…"
                    style={{
                      width: "100%", padding: "9px 14px", border: "1px solid #d1d5db",
                      borderRadius: "8px", fontSize: "13px", outline: "none",
                      boxSizing: "border-box", background: "#fff",
                    }}
                  />
                </div>
                <button style={S.actionBtn("primary")}
                  onClick={() => nav({ tab: "reviews", search: search || null, page: null })}>
                  Search
                </button>
                {hasActiveFilter && (
                  <button style={S.actionBtn("default")}
                    onClick={() => { setSearch(""); nav({ tab: "reviews", search: null, status: "all", type: "all", rating: null, page: null }); }}>
                    Clear filters
                  </button>
                )}
              </div>

              {/* Active filter chips */}
              {hasActiveFilter && (
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {search && (
                    <span style={{ ...S.tag("#eff6ff", "#1d4ed8"), gap: "4px" }}>
                      Search: "{search}"
                    </span>
                  )}
                  {status !== "all" && (
                    <span style={S.tag("#f3f4f6", "#374151")}>
                      Status: {STATUS[status]?.label ?? status}
                    </span>
                  )}
                  {type !== "all" && (
                    <span style={S.tag("#f3f4f6", "#374151")}>
                      Type: {type}
                    </span>
                  )}
                  {rating && (
                    <span style={S.tag("#fff7ed", "#c2410c")}>
                      {"★".repeat(rating)} only
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Loading overlay */}
            {isFiltering && (
              <div style={{
                position: "absolute", inset: 0, zIndex: 10,
                background: "rgba(249,250,251,0.7)",
                display: "flex", alignItems: "flex-start", justifyContent: "center",
                paddingTop: "80px",
              }}>
                <div style={{
                  background: "#fff", border: "1px solid #e5e7eb", borderRadius: "10px",
                  padding: "12px 24px", fontSize: "13px", color: "#6b7280", fontWeight: 500,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                }}>
                  Loading…
                </div>
              </div>
            )}

            {/* Result count */}
            <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "14px" }}>
              {reviewTotal === 0
                ? "No reviews"
                : `${reviewTotal.toLocaleString()} review${reviewTotal !== 1 ? "s" : ""}`}
              {!isFirstPage && " — page 2+"}
            </div>

            {/* Review cards */}
            {reviews.length === 0 ? (
              <div style={{ padding: "64px 0", textAlign: "center", color: "#9ca3af", fontSize: "14px", background: "#fff", borderRadius: "12px", border: "1px solid #e5e7eb" }}>
                No reviews match this filter.
              </div>
            ) : (
              reviews.map((review) => (
                <ReviewCard
                  key={review.id}
                  review={review}
                  replyingTo={replyingTo}
                  replyText={replyText}
                  setReplyingTo={setReplyingTo}
                  setReplyText={setReplyText}
                  submitAction={submitAction}
                />
              ))
            )}

            {/* Pagination */}
            {(hasPrev || hasMore) && (
              <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginTop: "24px", alignItems: "center" }}>
                <button
                  disabled={!hasPrev}
                  style={{ ...S.actionBtn("default"), opacity: hasPrev ? 1 : 0.4 }}
                  onClick={goPrev}
                >
                  ← Previous
                </button>
                <span style={{ fontSize: "13px", color: "#6b7280" }}>
                  {reviewTotal.toLocaleString()} total
                </span>
                <button
                  disabled={!hasMore}
                  style={{ ...S.actionBtn("default"), opacity: hasMore ? 1 : 0.4 }}
                  onClick={goNext}
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════ SETTINGS TAB ════════════════════ */}
      {tab === "settings" && (
        <>
          <s-section heading="Review incentives">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
              <s-text-field label="Points for approved text review"  value={textPoints}  onInput={(e: any) => setTextPoints(e.target.value)} />
              <s-text-field label="Bonus points for approved video"  value={videoPoints} onInput={(e: any) => setVideoPoints(e.target.value)} />
            </div>
          </s-section>
          <s-section heading="Auto-flag rules">
            <s-stack direction="block" gap="base">
              <s-text-field
                label="Keyword trigger list" value={flagKeywords}
                onInput={(e: any) => setFlagKeywords(e.target.value)}
                details="Comma-separated. Reviews containing these words are flagged for manual review."
              />
              <s-text-field
                label="Flag reviews with rating at or below" value={lowStarLimit}
                onInput={(e: any) => setLowStarLimit(e.target.value)}
                details="Set to 0 to disable low-star auto-flagging."
              />
            </s-stack>
          </s-section>
          <s-section>
            <s-button variant="primary" onClick={() => {
              const fd = new FormData();
              fd.set("intent", "save-settings"); fd.set("flagKeywords", flagKeywords);
              fd.set("lowStarThreshold", lowStarLimit); fd.set("textReviewPoints", textPoints);
              fd.set("videoReviewPoints", videoPoints);
              settingsFetcher.submit(fd, { method: "post" });
            }}>
              {settingsFetcher.state !== "idle" ? "Saving…" : "Save review settings"}
            </s-button>
          </s-section>
        </>
      )}
    </s-page>
  );
}

// ─── ReviewCard ───────────────────────────────────────────────────────────────

function ReviewCard({
  review, replyingTo, replyText, setReplyingTo, setReplyText, submitAction,
}: {
  review:        ReviewRow;
  replyingTo:    string | null;
  replyText:     string;
  setReplyingTo: (id: string | null) => void;
  setReplyText:  (t: string) => void;
  submitAction:  (fields: Record<string, string>) => void;
}) {
  const replyFetcher    = useFetcher();
  const isReplying      = replyingTo === review.id;
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const statusInfo      = STATUS[review.status] ?? STATUS.pending;
  const isProductReview = review.shopifyProductId !== "site";
  const activeVideo     = review.videos.find((v) => v.status !== "failed") ?? null;

  function handleReplySubmit() {
    if (!replyText.trim()) return;
    const fd = new FormData();
    fd.set("intent", "reply"); fd.set("reviewId", review.id); fd.set("reply", replyText);
    replyFetcher.submit(fd, { method: "post" });
    setReplyingTo(null); setReplyText("");
  }

  return (
    <div style={S.card}>
      <div style={S.cardBody}>

        {/* ── Left: review content ── */}
        <div style={{ minWidth: 0 }}>

          {/* Meta row */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "12px", color: "#9ca3af" }}>{fmtDate(review.createdAt)}</span>
            <span style={{ width: "3px", height: "3px", borderRadius: "50%", background: "#d1d5db", flexShrink: 0 }} />
            <span style={{ fontSize: "12px", color: "#6b7280" }}>
              {isProductReview ? "Product review" : "Site-wide review"}
            </span>
            {review.verifiedPurchase && (
              <span style={{ padding: "1px 8px", borderRadius: "999px", background: "#eff6ff", color: "#1d4ed8", fontSize: "11px", fontWeight: 600 }}>
                Verified purchase
              </span>
            )}
            {review.flagged && (
              <span style={{ padding: "1px 8px", borderRadius: "999px", background: "#fef2f2", color: "#b91c1c", fontSize: "11px", fontWeight: 600 }}>
                Flagged
              </span>
            )}
          </div>

          {/* Stars */}
          <div style={{ marginBottom: "8px" }}>
            {stars(review.rating, 17)}
          </div>

          {/* Title */}
          {review.title && (
            <div style={{ fontWeight: 700, fontSize: "15px", color: "#111827", marginBottom: "6px", lineHeight: 1.3 }}>
              {review.title}
            </div>
          )}

          {/* Body */}
          {review.body && (
            <div style={{ fontSize: "13px", color: "#4b5563", lineHeight: 1.7, marginBottom: "14px" }}>
              {review.body}
            </div>
          )}

          {/* Shopper info */}
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", fontSize: "12px", color: "#6b7280", marginBottom: "12px" }}>
            <span><strong style={{ color: "#374151" }}>{customerLabel(review)}</strong></span>
            {review.customer?.email && <span>{review.customer.email}</span>}
            {isProductReview && (
              <span style={{ fontFamily: "monospace", fontSize: "11px" }}>
                ID: {review.shopifyProductId}
              </span>
            )}
            {review.shopifyOrderId && (
              <span style={{ fontFamily: "monospace", fontSize: "11px" }}>
                Order: {review.shopifyOrderId}
              </span>
            )}
          </div>

          {/* Photos */}
          {review.photos.length > 0 && (
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
              {review.photos.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setLightboxUrl(p.url)}
                  style={{ padding: 0, border: "none", background: "none", cursor: "zoom-in", borderRadius: "8px" }}
                >
                  <img src={p.url} alt="" style={{ width: 64, height: 64, borderRadius: "8px", objectFit: "cover", border: "1px solid #e5e7eb", display: "block" }} />
                </button>
              ))}
            </div>
          )}

          {/* Lightbox */}
          {lightboxUrl && (
            <div
              onClick={() => setLightboxUrl(null)}
              style={{
                position: "fixed", inset: 0, zIndex: 9999,
                background: "rgba(0,0,0,0.85)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <button
                onClick={(e) => { e.stopPropagation(); setLightboxUrl(null); }}
                style={{
                  position: "absolute", top: "16px", right: "20px",
                  background: "none", border: "none", color: "#fff",
                  fontSize: "28px", cursor: "pointer", lineHeight: 1,
                }}
              >
                ×
              </button>
              <img
                src={lightboxUrl}
                alt=""
                onClick={(e) => e.stopPropagation()}
                style={{
                  maxWidth: "90vw", maxHeight: "90vh",
                  borderRadius: "10px", objectFit: "contain",
                  boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
                }}
              />
            </div>
          )}

          {/* Video */}
          {activeVideo && (activeVideo as any).url && (
            <div style={{ marginBottom: "12px" }}>
              <video src={(activeVideo as any).url} controls
                style={{ maxWidth: "100%", maxHeight: "180px", borderRadius: "8px", display: "block" }} />
              <button style={{ ...S.actionBtn("danger"), marginTop: "6px", fontSize: "11px" }}
                onClick={() => submitAction({ intent: "reject-video", videoId: activeVideo.id })}>
                Remove video
              </button>
            </div>
          )}

          {/* Admin reply */}
          {review.adminReply && !isReplying && (
            <div style={{ background: "#eff6ff", borderLeft: "3px solid #3b82f6", padding: "10px 14px", borderRadius: "0 8px 8px 0", fontSize: "13px" }}>
              <div style={{ fontWeight: 700, fontSize: "11px", color: "#1d4ed8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>
                Admin reply
              </div>
              <div style={{ color: "#374151" }}>{review.adminReply}</div>
            </div>
          )}

          {/* Reply form */}
          {isReplying && (
            <div>
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Write a public reply…"
                rows={3}
                style={{
                  width: "100%", padding: "10px 12px", border: "1px solid #d1d5db",
                  borderRadius: "8px", fontSize: "13px", resize: "vertical",
                  boxSizing: "border-box", outline: "none",
                }}
              />
              <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
                <button style={S.actionBtn("primary")} onClick={handleReplySubmit}>Post reply</button>
                <button style={S.actionBtn("default")} onClick={() => { setReplyingTo(null); setReplyText(""); }}>Cancel</button>
              </div>
            </div>
          )}
        </div>

        {/* ── Right: status + actions ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "flex-end" }}>
          {/* Status badge */}
          <span style={{
            padding: "4px 12px", borderRadius: "999px",
            background: statusInfo.bg, color: statusInfo.color,
            fontSize: "12px", fontWeight: 700, whiteSpace: "nowrap",
          }}>
            {statusInfo.label}
          </span>

          {/* Action buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: "100%" }}>
            {review.status !== "approved" && (
              <button style={{ ...S.actionBtn("primary"), width: "100%", textAlign: "center" }}
                onClick={() => submitAction({ intent: "approve", reviewId: review.id })}>
                Publish
              </button>
            )}
            {review.status === "approved" && (
              <button style={{ ...S.actionBtn("default"), width: "100%", textAlign: "center" }}
                onClick={() => submitAction({ intent: "reject", reviewId: review.id })}>
                Un-publish
              </button>
            )}
            {review.status !== "rejected" && review.status !== "approved" && (
              <button style={{ ...S.actionBtn("danger"), width: "100%", textAlign: "center" }}
                onClick={() => submitAction({ intent: "reject", reviewId: review.id })}>
                Reject
              </button>
            )}
            <button style={{ ...S.actionBtn("default"), width: "100%", textAlign: "center" }}
              onClick={() => { setReplyingTo(review.id); setReplyText(review.adminReply ?? ""); }}>
              {review.adminReply ? "Edit reply" : "Reply"}
            </button>
            {!review.flagged && (
              <button style={{ ...S.actionBtn("default"), width: "100%", textAlign: "center", fontSize: "11px" }}
                onClick={() => submitAction({ intent: "flag", reviewId: review.id })}>
                Flag
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
