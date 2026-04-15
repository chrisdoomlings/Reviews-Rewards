import { useState } from "react";
import type { CSSProperties } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useSearchParams, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { getShopConfig, saveShopConfig } from "../loyalty.server";
import {
  getReviewStats,
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

  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") ?? "overview";
  const statusFilter = url.searchParams.get("status") ?? "pending";
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
  const search = url.searchParams.get("search") ?? "";

  const [stats, reviewsData, config] = await Promise.all([
    getReviewStats(shop),
    getReviewsPage(shop, { status: statusFilter, page, search }),
    getShopConfig(shop),
  ]);

  return {
    tab,
    statusFilter,
    page,
    search,
    stats,
    reviews: reviewsData.reviews,
    reviewTotal: reviewsData.total,
    reviewPage: reviewsData.page,
    reviewPageSize: reviewsData.pageSize,
    reviewSettings: config.reviewSettings,
    earningRules: config.earningRules,
  };
};

// ─── Action ───────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  switch (intent) {
    case "approve": {
      await approveReview(formData.get("reviewId") as string, shop);
      return { ok: true };
    }
    case "reject": {
      await rejectReview(formData.get("reviewId") as string);
      return { ok: true };
    }
    case "reply": {
      await setAdminReply(
        formData.get("reviewId") as string,
        formData.get("reply") as string,
      );
      return { ok: true };
    }
    case "reject-video": {
      await rejectVideo(formData.get("videoId") as string);
      return { ok: true };
    }
    case "flag": {
      await flagReview(formData.get("reviewId") as string);
      return { ok: true };
    }
    case "save-settings": {
      const flagKeywords = ((formData.get("flagKeywords") as string) ?? "")
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
      const lowStarThreshold = Math.min(5, Math.max(1, parseInt(formData.get("lowStarThreshold") as string) || 2));
      const textReviewPoints = Math.max(0, parseInt(formData.get("textReviewPoints") as string) || 0);
      const videoReviewPoints = Math.max(0, parseInt(formData.get("videoReviewPoints") as string) || 0);
      await saveShopConfig(shop, {
        reviewSettings: { flagKeywords, lowStarThreshold },
        earningRules: { textReviewPoints, videoReviewPoints },
      });
      return { ok: true };
    }
    default:
      return { ok: false, error: "Unknown intent" };
  }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

type ReviewStatus = "pending" | "flagged" | "approved" | "rejected";

const statusStyle: Record<string, { background: string; color: string }> = {
  pending:  { background: "#fff1d6", color: "#9a6700" },
  flagged:  { background: "#fde8e8", color: "#b42318" },
  approved: { background: "#dff7e5", color: "#0a7d45" },
  rejected: { background: "#eceeef", color: "#5c5f62" },
};

function starDisplay(n: number) {
  return "★".repeat(n) + "☆".repeat(5 - n);
}

function customerLabel(r: ReviewRow) {
  if (!r.customer) return "Anonymous";
  const name = [r.customer.firstName, r.customer.lastName].filter(Boolean).join(" ");
  return name || r.customer.email;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  tabBar: {
    display: "flex",
    borderBottom: "1px solid #e1e3e5",
    margin: "-16px -16px 0",
    overflowX: "auto",
  } satisfies CSSProperties,

  tabBtn: (active: boolean): CSSProperties => ({
    padding: "12px 16px",
    border: "none",
    background: "none",
    borderBottom: active ? "2px solid #202223" : "2px solid transparent",
    color: active ? "#202223" : "#5c5f62",
    cursor: "pointer",
    fontWeight: active ? 600 : 500,
    fontSize: "13px",
    whiteSpace: "nowrap",
  }),

  pill: (active: boolean): CSSProperties => ({
    border: "1px solid",
    borderColor: active ? "#202223" : "#c9cccf",
    background: active ? "#202223" : "#fff",
    color: active ? "#fff" : "#202223",
    borderRadius: "999px",
    padding: "6px 12px",
    fontSize: "13px",
    cursor: "pointer",
  }),

  card: {
    border: "1px solid #e1e3e5",
    borderRadius: "14px",
    padding: "16px",
    background: "#fff",
    marginBottom: "12px",
  } satisfies CSSProperties,

  statCard: {
    padding: "16px",
    border: "1px solid #e1e3e5",
    borderRadius: "12px",
    background: "#fff",
  } satisfies CSSProperties,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function Reviews() {
  const data = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const actionFetcher = useFetcher();
  const settingsFetcher = useFetcher();

  // Reply form state: reviewId being replied to + draft text
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  // Settings form local state (mirrors DB values)
  const [flagKeywords, setFlagKeywords] = useState(
    data.reviewSettings.flagKeywords.join(", "),
  );
  const [lowStarLimit, setLowStarLimit] = useState(String(data.reviewSettings.lowStarThreshold));
  const [textPoints, setTextPoints] = useState(String(data.earningRules.textReviewPoints));
  const [videoPoints, setVideoPoints] = useState(String(data.earningRules.videoReviewPoints));

  const { tab, statusFilter, stats, reviews, reviewTotal, reviewPage, reviewPageSize } = data;

  // ── Navigation helpers ──────────────────────────────────────────────────────

  function navTab(t: string) {
    const p = new URLSearchParams(searchParams);
    p.set("tab", t);
    p.delete("page");
    if (t === "queue") p.set("status", "pending");
    else if (t === "approved") p.set("status", "approved");
    navigate(`?${p.toString()}`);
  }

  function navFilter(s: string) {
    const p = new URLSearchParams(searchParams);
    p.set("tab", "queue");
    p.set("status", s);
    p.delete("page");
    navigate(`?${p.toString()}`);
  }

  function navPage(pg: number) {
    const p = new URLSearchParams(searchParams);
    p.set("page", String(pg));
    navigate(`?${p.toString()}`);
  }

  // ── Mutation helper ─────────────────────────────────────────────────────────

  function submitAction(fields: Record<string, string>) {
    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => fd.set(k, v));
    actionFetcher.submit(fd, { method: "post" });
  }

  // ── Tab config ──────────────────────────────────────────────────────────────

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "queue",    label: `Queue (${stats.pending + stats.flagged})` },
    { key: "approved", label: "Approved content" },
    { key: "settings", label: "Settings" },
  ];

  // ── Total pages ─────────────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(reviewTotal / reviewPageSize));

  return (
    <s-page heading="Reviews admin">
      {/* ── Tab bar ── */}
      <s-section>
        <div style={S.tabBar}>
          {tabs.map((t) => (
            <button
              key={t.key}
              style={S.tabBtn(tab === t.key)}
              onClick={() => navTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </s-section>

      {/* ════════════════════ OVERVIEW TAB ════════════════════ */}
      {tab === "overview" && (
        <>
          <s-section heading="Moderation snapshot">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: "12px",
              }}
            >
              {[
                { label: "Pending",        value: stats.pending,       tone: "#9a6700" },
                { label: "Flagged",        value: stats.flagged,       tone: "#b42318" },
                { label: "Approved today", value: stats.approvedToday, tone: "#0a7d45" },
                { label: "Avg rating",     value: stats.avgRating || "—", tone: "#005bd3" },
              ].map((m) => (
                <div key={m.label} style={S.statCard}>
                  <div style={{ fontSize: "12px", color: "#5c5f62", marginBottom: "8px" }}>{m.label}</div>
                  <div style={{ fontSize: "30px", fontWeight: 700, color: m.tone }}>{m.value}</div>
                </div>
              ))}
            </div>
          </s-section>

          <s-section heading="Quick actions">
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <s-button onClick={() => navFilter("pending")}>Review pending queue</s-button>
              <s-button onClick={() => navFilter("flagged")}>Review flagged items</s-button>
            </div>
          </s-section>
        </>
      )}

      {/* ════════════════════ QUEUE TAB ════════════════════ */}
      {tab === "queue" && (
        <>
          <s-section heading="Filter">
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {(["pending", "flagged", "approved", "rejected", "all"] as const).map((s) => (
                <button
                  key={s}
                  style={S.pill(statusFilter === s)}
                  onClick={() => navFilter(s)}
                >
                  {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </s-section>

          <s-section heading={`${reviewTotal} review${reviewTotal !== 1 ? "s" : ""}`}>
            {reviews.length === 0 && (
              <div style={{ color: "#5c5f62", padding: "24px 0", textAlign: "center" }}>
                No reviews match this filter.
              </div>
            )}

            {reviews.map((review) => (
              <ReviewCard
                key={review.id}
                review={review}
                replyingTo={replyingTo}
                replyText={replyText}
                setReplyingTo={setReplyingTo}
                setReplyText={setReplyText}
                submitAction={submitAction}
              />
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginTop: "16px" }}>
                <s-button
                  disabled={reviewPage <= 1}
                  onClick={() => navPage(reviewPage - 1)}
                >
                  Previous
                </s-button>
                <span style={{ lineHeight: "32px", fontSize: "13px" }}>
                  Page {reviewPage} of {totalPages}
                </span>
                <s-button
                  disabled={reviewPage >= totalPages}
                  onClick={() => navPage(reviewPage + 1)}
                >
                  Next
                </s-button>
              </div>
            )}
          </s-section>
        </>
      )}

      {/* ════════════════════ APPROVED TAB ════════════════════ */}
      {tab === "approved" && (
        <s-section heading="Approved reviews">
          {reviews.length === 0 && (
            <div style={{ color: "#5c5f62", padding: "24px 0", textAlign: "center" }}>
              No approved reviews yet.
            </div>
          )}
          {reviews.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #d2d5d8" }}>
                    {["Customer", "Product", "Rating", "Media", "Verified", "Date", "Actions"].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left",
                          padding: "10px 12px",
                          color: "#5c5f62",
                          fontSize: "12px",
                          textTransform: "uppercase",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reviews.map((r) => (
                    <tr key={r.id} style={{ borderBottom: "1px solid #eceeef" }}>
                      <td style={{ padding: "12px", fontWeight: 600 }}>{customerLabel(r)}</td>
                      <td style={{ padding: "12px" }}>{r.shopifyProductId}</td>
                      <td style={{ padding: "12px", color: "#d09100" }}>{starDisplay(r.rating)}</td>
                      <td style={{ padding: "12px" }}>
                        {r.videos.length > 0 ? "Video" : r.photos.length > 0 ? "Photo" : "Text"}
                      </td>
                      <td style={{ padding: "12px" }}>{r.verifiedPurchase ? "Yes" : "No"}</td>
                      <td style={{ padding: "12px", color: "#5c5f62" }}>
                        {new Date(r.createdAt).toLocaleDateString()}
                      </td>
                      <td style={{ padding: "12px" }}>
                        <s-button
                          onClick={() => submitAction({ intent: "reject", reviewId: r.id })}
                        >
                          Un-approve
                        </s-button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </s-section>
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

// ─── ReviewCard sub-component ────────────────────────────────────────────────

function ReviewCard({
  review,
  replyingTo,
  replyText,
  setReplyingTo,
  setReplyText,
  submitAction,
}: {
  review: ReviewRow;
  replyingTo: string | null;
  replyText: string;
  setReplyingTo: (id: string | null) => void;
  setReplyText: (t: string) => void;
  submitAction: (fields: Record<string, string>) => void;
}) {
  const replyFetcher = useFetcher();
  const isReplying = replyingTo === review.id;
  const statusBadge = statusStyle[review.status] ?? statusStyle.pending;

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

  const activeVideo = review.videos.find((v) => v.status !== "failed") ?? null;

  return (
    <div style={{ ...S.card, marginBottom: "12px" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.6fr) minmax(240px, 0.9fr)",
          gap: "18px",
        }}
      >
        {/* Left: review content */}
        <div>
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "12px",
              marginBottom: "10px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontWeight: 600, marginBottom: "4px" }}>
                {customerLabel(review)}
              </div>
              <div style={{ fontSize: "12px", color: "#5c5f62" }}>
                {new Date(review.createdAt).toLocaleString()} ·{" "}
                {review.shopifyProductId}
                {review.verifiedPurchase && (
                  <span style={{ marginLeft: "8px", color: "#0a7d45" }}>✓ Verified purchase</span>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {review.flagged && (
                <span
                  style={{
                    padding: "3px 8px",
                    borderRadius: "999px",
                    background: "#fde8e8",
                    color: "#b42318",
                    fontSize: "11px",
                    fontWeight: 600,
                  }}
                >
                  Flagged
                </span>
              )}
              <span
                style={{
                  padding: "4px 10px",
                  borderRadius: "999px",
                  background: statusBadge.background,
                  color: statusBadge.color,
                  fontSize: "12px",
                  fontWeight: 600,
                  textTransform: "capitalize",
                }}
              >
                {review.status}
              </span>
            </div>
          </div>

          {/* Rating + text */}
          <div style={{ color: "#d09100", fontSize: "17px", marginBottom: "6px" }}>
            {starDisplay(review.rating)}
          </div>
          {review.title && (
            <div style={{ fontWeight: 600, fontSize: "15px", marginBottom: "4px" }}>
              {review.title}
            </div>
          )}
          {review.body && (
            <div style={{ fontSize: "13px", color: "#3d3f41", lineHeight: 1.6, marginBottom: "12px" }}>
              {review.body}
            </div>
          )}

          {/* Existing admin reply */}
          {review.adminReply && (
            <div
              style={{
                background: "#f6f6f7",
                borderLeft: "3px solid #005bd3",
                padding: "10px 12px",
                borderRadius: "0 8px 8px 0",
                fontSize: "13px",
                color: "#202223",
                marginBottom: "12px",
              }}
            >
              <span style={{ fontWeight: 600, display: "block", marginBottom: "4px" }}>
                Admin reply
              </span>
              {review.adminReply}
            </div>
          )}

          {/* Reply form */}
          {isReplying && (
            <div style={{ marginBottom: "12px" }}>
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Write a public reply…"
                rows={3}
                style={{
                  width: "100%",
                  padding: "8px",
                  borderRadius: "8px",
                  border: "1px solid #c9cccf",
                  fontSize: "13px",
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                <s-button variant="primary" onClick={handleReplySubmit}>Post reply</s-button>
                <s-button onClick={() => { setReplyingTo(null); setReplyText(""); }}>Cancel</s-button>
              </div>
            </div>
          )}

          {/* Photos */}
          {review.photos.length > 0 && (
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
              {review.photos.map((p) => (
                <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
                  <img
                    src={p.url}
                    alt="Review photo"
                    style={{ width: 64, height: 64, borderRadius: "8px", objectFit: "cover" }}
                  />
                </a>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "4px" }}>
            {review.status !== "approved" && (
              <s-button
                variant="primary"
                onClick={() => submitAction({ intent: "approve", reviewId: review.id })}
              >
                Approve
              </s-button>
            )}
            {review.status !== "rejected" && (
              <s-button onClick={() => submitAction({ intent: "reject", reviewId: review.id })}>
                Reject
              </s-button>
            )}
            {!review.flagged && (
              <s-button onClick={() => submitAction({ intent: "flag", reviewId: review.id })}>
                Flag
              </s-button>
            )}
            {!isReplying && (
              <s-button
                onClick={() => {
                  setReplyingTo(review.id);
                  setReplyText(review.adminReply ?? "");
                }}
              >
                {review.adminReply ? "Edit reply" : "Reply publicly"}
              </s-button>
            )}
          </div>
        </div>

        {/* Right: media panel */}
        <div
          style={{
            border: "1px solid #eceeef",
            borderRadius: "12px",
            padding: "14px",
            background: "#fafbfb",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: "10px" }}>Media</div>
          <div style={{ fontSize: "13px", color: "#5c5f62", marginBottom: "10px" }}>
            Photos: {review.photos.length} · Videos: {review.videos.length}
          </div>

          {activeVideo ? (
            <div>
              <div
                style={{
                  border: "1px dashed #c9cccf",
                  borderRadius: "10px",
                  background: "#fff",
                  minHeight: "100px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "10px",
                  marginBottom: "10px",
                  textAlign: "center",
                }}
              >
                {activeVideo.url ? (
                  <video
                    src={activeVideo.url}
                    controls
                    style={{ maxWidth: "100%", maxHeight: "180px", borderRadius: "6px" }}
                  />
                ) : (
                  <div style={{ fontSize: "12px", color: "#5c5f62" }}>Video not yet accessible</div>
                )}
              </div>
              <div style={{ fontSize: "12px", color: "#5c5f62", marginBottom: "8px" }}>
                Status:{" "}
                <span
                  style={{
                    fontWeight: 600,
                    color:
                      activeVideo.status === "ready"
                        ? "#0a7d45"
                        : activeVideo.status === "failed"
                          ? "#b42318"
                          : "#9a6700",
                  }}
                >
                  {activeVideo.status}
                </span>
                {activeVideo.durationSecs != null && ` · ${activeVideo.durationSecs}s`}
              </div>
              <s-button
                onClick={() => submitAction({ intent: "reject-video", videoId: activeVideo.id })}
              >
                Reject video
              </s-button>
            </div>
          ) : (
            <div
              style={{
                border: "1px dashed #c9cccf",
                borderRadius: "10px",
                background: "#fff",
                minHeight: "80px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "12px",
                textAlign: "center",
                fontSize: "12px",
                color: "#5c5f62",
              }}
            >
              {review.videos.length > 0 ? "Video rejected" : "No video attached"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
