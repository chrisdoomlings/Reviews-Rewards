import { useState } from "react";
import type { CSSProperties } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useSearchParams, useFetcher } from "react-router";
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

  const url    = new URL(request.url);
  const tab    = url.searchParams.get("tab")    ?? "reviews";
  const status = url.searchParams.get("status") ?? "all";
  const type   = url.searchParams.get("type")   ?? "all";
  const ratingParam = url.searchParams.get("rating");
  const rating = ratingParam ? parseInt(ratingParam) : undefined;
  const page   = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
  const search = url.searchParams.get("search") ?? "";

  const [stats, ratingCounts, reviewsData, config] = await Promise.all([
    getReviewStats(shop),
    getRatingCounts(shop),
    getReviewsPage(shop, { status, page, search, rating, type }),
    getShopConfig(shop),
  ]);

  return {
    tab, status, type, rating: rating ?? null, page, search,
    stats, ratingCounts,
    reviews: reviewsData.reviews,
    reviewTotal: reviewsData.total,
    reviewPage:  reviewsData.page,
    reviewPageSize: reviewsData.pageSize,
    reviewSettings: config.reviewSettings,
    earningRules:   config.earningRules,
  };
};

// ─── Action ───────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const intent   = formData.get("intent") as string;

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
      const flagKeywords = ((formData.get("flagKeywords") as string) ?? "")
        .split(",").map((k) => k.trim()).filter(Boolean);
      const lowStarThreshold = Math.min(5, Math.max(1, parseInt(formData.get("lowStarThreshold") as string) || 2));
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function starDisplay(n: number, size = 16) {
  return (
    <span style={{ color: "#f4a807", fontSize: size, letterSpacing: 1 }}>
      {"★".repeat(n)}
      <span style={{ color: "#d1d5db" }}>{"★".repeat(5 - n)}</span>
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
  return new Date(iso).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" });
}

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  pending:  { bg: "#fff1d6", color: "#9a6700" },
  flagged:  { bg: "#fde8e8", color: "#b42318" },
  approved: { bg: "#dff7e5", color: "#0a7d45" },
  rejected: { bg: "#eceeef", color: "#5c5f62" },
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  page: {
    display: "grid",
    gridTemplateColumns: "220px 1fr",
    gap: "0",
    minHeight: "calc(100vh - 56px)",
    alignItems: "start",
  } satisfies CSSProperties,

  sidebar: {
    borderRight: "1px solid #e1e3e5",
    padding: "16px 0",
    position: "sticky" as const,
    top: 0,
    minHeight: "100vh",
  } satisfies CSSProperties,

  sideSection: {
    padding: "12px 16px",
    borderBottom: "1px solid #e1e3e5",
  } satisfies CSSProperties,

  sideSectionLast: {
    padding: "12px 16px",
  } satisfies CSSProperties,

  sideLabel: {
    fontSize: "11px",
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    color: "#5c5f62",
    marginBottom: "10px",
  } satisfies CSSProperties,

  filterRow: (active: boolean): CSSProperties => ({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: "6px",
    cursor: "pointer",
    background: active ? "#f3f3f7" : "transparent",
    fontWeight: active ? 600 : 400,
    fontSize: "13px",
    color: active ? "#202223" : "#3d3f41",
    marginBottom: "2px",
    border: "none",
    width: "100%",
    textAlign: "left" as const,
  }),

  badge: (color: { bg: string; color: string }): CSSProperties => ({
    padding: "2px 8px",
    borderRadius: "999px",
    background: color.bg,
    color: color.color,
    fontSize: "11px",
    fontWeight: 600,
  }),

  typePill: (active: boolean): CSSProperties => ({
    padding: "5px 12px",
    borderRadius: "999px",
    border: "1px solid",
    borderColor: active ? "#202223" : "#c9cccf",
    background: active ? "#202223" : "transparent",
    color: active ? "#fff" : "#5c5f62",
    fontSize: "12px",
    cursor: "pointer",
    fontWeight: active ? 600 : 400,
  }),

  card: {
    border: "1px solid #e1e3e5",
    borderRadius: "10px",
    padding: "18px 20px",
    background: "#fff",
    marginBottom: "10px",
  } satisfies CSSProperties,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function Reviews() {
  const data           = useLoaderData<typeof loader>();
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();
  const actionFetcher  = useFetcher();
  const settingsFetcher = useFetcher();

  const [search, setSearch]       = useState(data.search);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText]   = useState("");
  const [flagKeywords, setFlagKeywords] = useState(data.reviewSettings.flagKeywords.join(", "));
  const [lowStarLimit, setLowStarLimit] = useState(String(data.reviewSettings.lowStarThreshold));
  const [textPoints, setTextPoints]     = useState(String(data.earningRules.textReviewPoints));
  const [videoPoints, setVideoPoints]   = useState(String(data.earningRules.videoReviewPoints));

  const { tab, status, type, rating, stats, ratingCounts, reviews, reviewTotal, reviewPage, reviewPageSize } = data;
  const totalPages = Math.max(1, Math.ceil(reviewTotal / reviewPageSize));

  function nav(updates: Record<string, string | null>) {
    const p = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(updates)) {
      if (v == null) p.delete(k); else p.set(k, v);
    }
    p.delete("page");
    navigate(`?${p.toString()}`);
  }

  function submitAction(fields: Record<string, string>) {
    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => fd.set(k, v));
    actionFetcher.submit(fd, { method: "post" });
  }

  const tabs = [
    { key: "reviews",  label: `Reviews (${reviewTotal})` },
    { key: "settings", label: "Settings" },
  ];

  return (
    <s-page heading="Reviews">
      {/* ── Tab bar ── */}
      <s-section>
        <div style={{ display: "flex", borderBottom: "1px solid #e1e3e5", margin: "-16px -16px 0", overflowX: "auto" }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              style={{
                padding: "12px 16px", border: "none", background: "none",
                borderBottom: tab === t.key ? "2px solid #202223" : "2px solid transparent",
                color: tab === t.key ? "#202223" : "#5c5f62",
                cursor: "pointer", fontWeight: tab === t.key ? 600 : 500,
                fontSize: "13px", whiteSpace: "nowrap",
              }}
              onClick={() => nav({ tab: t.key })}
            >
              {t.label}
            </button>
          ))}
        </div>
      </s-section>

      {/* ════════════════════ REVIEWS TAB ════════════════════ */}
      {tab === "reviews" && (
        <div style={S.page}>

          {/* ── Left sidebar ── */}
          <div style={S.sidebar}>

            {/* Stats summary */}
            <div style={S.sideSection}>
              <div style={S.sideLabel}>Moderation</div>
              {[
                { label: "Pending review",  count: stats.pending,  key: "pending" },
                { label: "Flagged",         count: stats.flagged,  key: "flagged" },
                { label: "Total reviews",   count: reviewTotal,    key: "all" },
              ].map((item) => (
                <button
                  key={item.key}
                  style={S.filterRow(status === item.key)}
                  onClick={() => nav({ tab: "reviews", status: item.key, rating: null, type: null })}
                >
                  <span>{item.label}</span>
                  <span style={{ fontSize: "12px", color: "#5c5f62", fontWeight: 400 }}>{item.count}</span>
                </button>
              ))}
            </div>

            {/* Status filter */}
            <div style={S.sideSection}>
              <div style={S.sideLabel}>Status</div>
              {[
                { label: "All",      key: "all" },
                { label: "Pending",  key: "pending" },
                { label: "Published",key: "approved" },
                { label: "Rejected", key: "rejected" },
                { label: "Flagged",  key: "flagged" },
              ].map((item) => (
                <button
                  key={item.key}
                  style={S.filterRow(status === item.key)}
                  onClick={() => nav({ tab: "reviews", status: item.key, page: null })}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* Content type */}
            <div style={S.sideSection}>
              <div style={S.sideLabel}>Content type</div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {[
                  { label: "All",     key: "all" },
                  { label: "Product", key: "product" },
                  { label: "Site",    key: "site" },
                ].map((item) => (
                  <button
                    key={item.key}
                    style={S.typePill(type === item.key)}
                    onClick={() => nav({ tab: "reviews", type: item.key, page: null })}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Star rating filter */}
            <div style={S.sideSectionLast}>
              <div style={S.sideLabel}>Star rating</div>
              {[5, 4, 3, 2, 1].map((n) => (
                <button
                  key={n}
                  style={S.filterRow(rating === n)}
                  onClick={() => nav({ tab: "reviews", rating: rating === n ? null : String(n), page: null })}
                >
                  <span style={{ color: "#f4a807", letterSpacing: 1 }}>{"★".repeat(n)}<span style={{ color: "#d1d5db" }}>{"★".repeat(5 - n)}</span></span>
                  <span style={{ fontSize: "12px", color: "#5c5f62" }}>{ratingCounts[n] ?? 0}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Main content ── */}
          <div style={{ padding: "16px 20px" }}>

            {/* Search bar */}
            <div style={{ marginBottom: "16px", display: "flex", gap: "8px" }}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") nav({ tab: "reviews", search: search || null, page: null }); }}
                placeholder="Search reviews…"
                style={{
                  flex: 1, padding: "8px 12px", border: "1px solid #c9cccf",
                  borderRadius: "8px", fontSize: "13px", outline: "none",
                }}
              />
              <s-button onClick={() => nav({ tab: "reviews", search: search || null, page: null })}>
                Search
              </s-button>
              {(search || status !== "all" || type !== "all" || rating) && (
                <s-button onClick={() => { setSearch(""); nav({ tab: "reviews", search: null, status: "all", type: "all", rating: null, page: null }); }}>
                  Clear
                </s-button>
              )}
            </div>

            {/* Review cards */}
            {reviews.length === 0 ? (
              <div style={{ padding: "48px 0", textAlign: "center", color: "#5c5f62", fontSize: "14px" }}>
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
            {totalPages > 1 && (
              <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginTop: "20px", alignItems: "center" }}>
                <s-button
                  disabled={reviewPage <= 1}
                  onClick={() => { const p = new URLSearchParams(searchParams); p.set("page", String(reviewPage - 1)); navigate(`?${p.toString()}`); }}
                >
                  Previous
                </s-button>
                <span style={{ fontSize: "13px", color: "#5c5f62" }}>
                  Page {reviewPage} of {totalPages}
                </span>
                <s-button
                  disabled={reviewPage >= totalPages}
                  onClick={() => { const p = new URLSearchParams(searchParams); p.set("page", String(reviewPage + 1)); navigate(`?${p.toString()}`); }}
                >
                  Next
                </s-button>
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
              <s-text-field
                label="Points for approved text review"
                value={textPoints}
                onInput={(e: any) => setTextPoints(e.target.value)}
              />
              <s-text-field
                label="Bonus points for approved video review"
                value={videoPoints}
                onInput={(e: any) => setVideoPoints(e.target.value)}
              />
            </div>
          </s-section>

          <s-section heading="Auto-flag rules">
            <s-stack direction="block" gap="base">
              <s-text-field
                label="Keyword trigger list"
                value={flagKeywords}
                onInput={(e: any) => setFlagKeywords(e.target.value)}
                details="Comma-separated. Reviews containing these words are flagged for manual review."
              />
              <s-text-field
                label="Flag reviews with rating at or below"
                value={lowStarLimit}
                onInput={(e: any) => setLowStarLimit(e.target.value)}
                details="Reviews at or below this star rating are auto-flagged. Set to 0 to disable."
              />
            </s-stack>
          </s-section>

          <s-section>
            <s-button
              variant="primary"
              onClick={() => {
                const fd = new FormData();
                fd.set("intent", "save-settings");
                fd.set("flagKeywords", flagKeywords);
                fd.set("lowStarThreshold", lowStarLimit);
                fd.set("textReviewPoints", textPoints);
                fd.set("videoReviewPoints", videoPoints);
                settingsFetcher.submit(fd, { method: "post" });
              }}
            >
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
  review: ReviewRow;
  replyingTo: string | null;
  replyText: string;
  setReplyingTo: (id: string | null) => void;
  setReplyText: (t: string) => void;
  submitAction: (fields: Record<string, string>) => void;
}) {
  const replyFetcher  = useFetcher();
  const isReplying    = replyingTo === review.id;
  const [expanded, setExpanded] = useState(false);
  const statusColor   = STATUS_COLOR[review.status] ?? STATUS_COLOR.pending;
  const isProductReview = review.shopifyProductId !== "site";
  const activeVideo   = review.videos.find((v) => v.status !== "failed") ?? null;

  function handleReplySubmit() {
    if (!replyText.trim()) return;
    const fd = new FormData();
    fd.set("intent", "reply");
    fd.set("reviewId", review.id);
    fd.set("reply", replyText);
    replyFetcher.submit(fd, { method: "post" });
    setReplyingTo(null);
    setReplyText("");
  }

  return (
    <div style={S.card}>

      {/* ── Top row: date, type badge, status badge ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "12px", color: "#6b7280" }}>{fmtDate(review.createdAt)}</span>
        <span style={{ padding: "2px 10px", borderRadius: "999px", background: "#f3f4f6", color: "#374151", fontSize: "12px", fontWeight: 500 }}>
          {isProductReview ? "Product review" : "Site review"}
        </span>
        {review.flagged && (
          <span style={{ padding: "2px 10px", borderRadius: "999px", background: "#fde8e8", color: "#b42318", fontSize: "12px", fontWeight: 500 }}>
            Flagged
          </span>
        )}
        <span style={{ ...S.badge(statusColor), textTransform: "capitalize" }}>
          {review.status === "approved" ? "Published" : review.status}
        </span>
        {review.verifiedPurchase && (
          <span style={{ padding: "2px 10px", borderRadius: "999px", background: "#eff6ff", color: "#1d4ed8", fontSize: "12px", fontWeight: 500 }}>
            Verified by order
          </span>
        )}
      </div>

      {/* ── Stars ── */}
      <div style={{ marginBottom: "6px" }}>{starDisplay(review.rating, 18)}</div>

      {/* ── Title & body ── */}
      {review.title && (
        <div style={{ fontWeight: 700, fontSize: "15px", marginBottom: "4px", color: "#111827" }}>
          {review.title}
        </div>
      )}
      {review.body && (
        <div style={{ fontSize: "13px", color: "#4b5563", lineHeight: 1.65, marginBottom: "14px" }}>
          {review.body}
        </div>
      )}

      {/* ── Shopper info ── */}
      <div style={{ fontSize: "13px", color: "#374151", marginBottom: "12px", display: "grid", gap: "3px" }}>
        <div>
          <span style={{ color: "#9ca3af", marginRight: "4px" }}>Shopper name:</span>
          <strong>{customerLabel(review)}</strong>
        </div>
        {(review.customer?.email || review.reviewerName) && (
          <div>
            <span style={{ color: "#9ca3af", marginRight: "4px" }}>Shopper email:</span>
            <span>{review.customer?.email ?? "—"}</span>
          </div>
        )}
        <div>
          <span style={{ color: "#9ca3af", marginRight: "4px" }}>Product:</span>
          <span>{isProductReview ? review.shopifyProductId : "Site-wide review"}</span>
        </div>
      </div>

      {/* ── Expandable details ── */}
      <button
        style={{ background: "none", border: "none", color: "#6b7280", fontSize: "13px", cursor: "pointer", padding: "0 0 10px", textDecoration: "underline" }}
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? "Less details ▲" : "More details ▼"}
      </button>

      {expanded && (
        <div style={{ background: "#f9fafb", borderRadius: "8px", padding: "12px 14px", marginBottom: "14px", fontSize: "13px" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <tbody>
              {review.shopifyOrderId && (
                <tr>
                  <td style={{ padding: "4px 12px 4px 0", color: "#6b7280", whiteSpace: "nowrap" }}>Order ID</td>
                  <td style={{ padding: "4px 0" }}>{review.shopifyOrderId}</td>
                </tr>
              )}
              <tr>
                <td style={{ padding: "4px 12px 4px 0", color: "#6b7280", whiteSpace: "nowrap" }}>Media</td>
                <td style={{ padding: "4px 0" }}>
                  {review.videos.length > 0 ? `Video (${review.videos.length})` :
                   review.photos.length > 0 ? `Photos (${review.photos.length})` : "Text only"}
                </td>
              </tr>
              <tr>
                <td style={{ padding: "4px 12px 4px 0", color: "#6b7280", whiteSpace: "nowrap" }}>Date</td>
                <td style={{ padding: "4px 0" }}>{new Date(review.createdAt).toLocaleString()}</td>
              </tr>
            </tbody>
          </table>

          {/* Photos */}
          {review.photos.length > 0 && (
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "10px" }}>
              {review.photos.map((p) => (
                <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
                  <img src={p.url} alt="Review photo" style={{ width: 60, height: 60, borderRadius: "6px", objectFit: "cover" }} />
                </a>
              ))}
            </div>
          )}

          {/* Video */}
          {activeVideo && activeVideo.url && (
            <div style={{ marginTop: "10px" }}>
              <video src={activeVideo.url} controls style={{ maxWidth: "100%", maxHeight: "160px", borderRadius: "6px" }} />
              <div style={{ marginTop: "6px" }}>
                <s-button onClick={() => submitAction({ intent: "reject-video", videoId: activeVideo.id })}>
                  Reject video
                </s-button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Admin reply ── */}
      {review.adminReply && !isReplying && (
        <div style={{ background: "#f0f4ff", borderLeft: "3px solid #3b82f6", padding: "10px 12px", borderRadius: "0 8px 8px 0", fontSize: "13px", marginBottom: "12px" }}>
          <span style={{ fontWeight: 600, display: "block", marginBottom: "2px", color: "#1d4ed8" }}>Admin reply</span>
          <span style={{ color: "#374151" }}>{review.adminReply}</span>
        </div>
      )}

      {/* ── Reply form ── */}
      {isReplying && (
        <div style={{ marginBottom: "12px" }}>
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Write a public reply…"
            rows={3}
            style={{ width: "100%", padding: "8px 10px", borderRadius: "8px", border: "1px solid #c9cccf", fontSize: "13px", resize: "vertical", boxSizing: "border-box" }}
          />
          <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
            <s-button variant="primary" onClick={handleReplySubmit}>Post reply</s-button>
            <s-button onClick={() => { setReplyingTo(null); setReplyText(""); }}>Cancel</s-button>
          </div>
        </div>
      )}

      {/* ── Action buttons ── */}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", borderTop: "1px solid #f3f4f6", paddingTop: "12px", marginTop: "4px" }}>
        {review.status !== "approved" && (
          <s-button variant="primary" onClick={() => submitAction({ intent: "approve", reviewId: review.id })}>
            Publish
          </s-button>
        )}
        {review.status === "approved" && (
          <s-button onClick={() => submitAction({ intent: "reject", reviewId: review.id })}>
            Un-publish
          </s-button>
        )}
        {review.status !== "rejected" && review.status !== "approved" && (
          <s-button onClick={() => submitAction({ intent: "reject", reviewId: review.id })}>
            Reject
          </s-button>
        )}
        {!review.flagged && (
          <s-button onClick={() => submitAction({ intent: "flag", reviewId: review.id })}>
            Flag
          </s-button>
        )}
        <s-button
          onClick={() => { setReplyingTo(review.id); setReplyText(review.adminReply ?? ""); }}
        >
          {review.adminReply ? "Edit reply" : "Comment"}
        </s-button>
      </div>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
