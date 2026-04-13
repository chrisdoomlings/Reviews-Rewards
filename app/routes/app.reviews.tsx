import { useState } from "react";
import type { CSSProperties } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return {};
};

type Tab = "overview" | "queue" | "approved" | "settings";
type ReviewStatus = "pending" | "flagged" | "approved" | "rejected";

const queueMetrics = [
  { label: "Pending", value: "37", tone: "#9a6700" },
  { label: "Flagged", value: "9", tone: "#b42318" },
  { label: "Approved today", value: "22", tone: "#0a7d45" },
  { label: "Average rating", value: "4.7", tone: "#005bd3" },
];

const reviews = [
  {
    id: 101,
    customer: "Sarah M.",
    product: "Doomlings Base Game",
    status: "pending" as ReviewStatus,
    rating: 5,
    title: "Best family game we bought this year",
    body:
      "Easy to teach, hilarious every round, and the card quality is excellent. This is already our go-to gift recommendation.",
    media: { photos: 2, video: true, duration: "00:44", moderation: "Video pending" },
    submittedAt: "Today at 10:32 AM",
    source: "Account review prompt",
    flags: ["Verified purchase"],
  },
  {
    id: 102,
    customer: "Mike T.",
    product: "Age of Dangers Expansion",
    status: "flagged" as ReviewStatus,
    rating: 2,
    title: "Expansion is fun but shipment arrived late",
    body:
      "Gameplay is strong, but this came later than expected and the box corners were bent. Would still recommend after support helped.",
    media: { photos: 1, video: false, duration: null, moderation: "Text flagged" },
    submittedAt: "Today at 8:10 AM",
    source: "Product page app block",
    flags: ["Low star trigger"],
  },
  {
    id: 103,
    customer: "Emma W.",
    product: "Doomlings Base Game",
    status: "approved" as ReviewStatus,
    rating: 5,
    title: "Video review converted really well",
    body:
      "Uploaded a quick clip of our game night and the review went through smoothly. Love the art direction and replayability.",
    media: { photos: 0, video: true, duration: "00:21", moderation: "Approved" },
    submittedAt: "Yesterday",
    source: "Post-purchase review prompt",
    flags: ["Verified purchase"],
  },
  {
    id: 104,
    customer: "Tom H.",
    product: "Promo Pack",
    status: "rejected" as ReviewStatus,
    rating: 1,
    title: "Spam review",
    body: "Cheap codes available at external site...",
    media: { photos: 0, video: false, duration: null, moderation: "Rejected" },
    submittedAt: "Yesterday",
    source: "Product page app block",
    flags: ["Keyword rule"],
  },
];

const statusStyle: Record<ReviewStatus, { background: string; color: string }> = {
  pending: { background: "#fff1d6", color: "#9a6700" },
  flagged: { background: "#fde8e8", color: "#b42318" },
  approved: { background: "#dff7e5", color: "#0a7d45" },
  rejected: { background: "#eceeef", color: "#5c5f62" },
};

const stars = (count: number) => `${count}/5`;

const styles = {
  tabBar: {
    display: "flex",
    borderBottom: "1px solid #e1e3e5",
    margin: "-16px -16px 0",
    overflowX: "auto",
  } satisfies CSSProperties,
  tabButton: (active: boolean) =>
    ({
      padding: "12px 16px",
      border: "none",
      background: "none",
      borderBottom: active ? "2px solid #202223" : "2px solid transparent",
      color: active ? "#202223" : "#5c5f62",
      cursor: "pointer",
      fontWeight: active ? 600 : 500,
      fontSize: "13px",
      whiteSpace: "nowrap",
    }) satisfies CSSProperties,
};

export default function Reviews() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [filter, setFilter] = useState<ReviewStatus | "all">("all");
  const [reviewPoints, setReviewPoints] = useState("75");
  const [videoBonus, setVideoBonus] = useState("50");
  const [flagKeywords, setFlagKeywords] = useState("spam, discount, cheap, external link");
  const [lowStarLimit, setLowStarLimit] = useState("2");

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "queue", label: "Moderation queue" },
    { key: "approved", label: "Approved content" },
    { key: "settings", label: "Settings" },
  ];

  const filteredReviews =
    filter === "all" ? reviews : reviews.filter((review) => review.status === filter);

  return (
    <s-page heading="Reviews admin">
      <s-section>
        <div style={styles.tabBar}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              style={styles.tabButton(activeTab === tab.key)}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </s-section>

      {activeTab === "overview" && (
        <>
          <s-section heading="Moderation performance">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "12px",
              }}
            >
              {queueMetrics.map((metric) => (
                <div
                  key={metric.label}
                  style={{
                    padding: "16px",
                    border: "1px solid #e1e3e5",
                    borderRadius: "12px",
                    background: "#fff",
                  }}
                >
                  <div style={{ fontSize: "12px", color: "#5c5f62", marginBottom: "8px" }}>
                    {metric.label}
                  </div>
                  <div style={{ fontSize: "30px", fontWeight: 700, color: metric.tone }}>
                    {metric.value}
                  </div>
                </div>
              ))}
            </div>
          </s-section>

          <s-section heading="Review channel health">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1.7fr) minmax(260px, 1fr)",
                gap: "12px",
              }}
            >
              <div
                style={{
                  border: "1px solid #e1e3e5",
                  borderRadius: "12px",
                  padding: "16px",
                  background: "#fff",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: "10px" }}>
                  Submission sources
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {[
                    { label: "Account review prompt", share: "43%" },
                    { label: "Post-purchase review prompt", share: "36%" },
                    { label: "Pebble PDP review block", share: "21%" },
                  ].map((row) => (
                    <div key={row.label}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: "4px",
                          fontSize: "13px",
                        }}
                      >
                        <span>{row.label}</span>
                        <span style={{ fontWeight: 600 }}>{row.share}</span>
                      </div>
                      <div style={{ height: "8px", background: "#eceeef", borderRadius: "999px" }}>
                        <div
                          style={{
                            width: row.share,
                            height: "100%",
                            background: "#005bd3",
                            borderRadius: "999px",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div
                style={{
                  border: "1px solid #e1e3e5",
                  borderRadius: "12px",
                  padding: "16px",
                  background: "#fafbfb",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: "8px" }}>Video review watchouts</div>
                <div style={{ fontSize: "13px", color: "#5c5f62", lineHeight: 1.5 }}>
                  Keep processed video URLs separated from raw uploads, and allow moderators
                  to reject the video while preserving approved text review content.
                </div>
              </div>
            </div>
          </s-section>
        </>
      )}

      {activeTab === "queue" && (
        <>
          <s-section heading="Queue filters">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: "12px",
              }}
            >
              <s-text-field label="Search reviews" value="" placeholder="Customer, product, order" />
              <s-select label="Status">
                <s-option value="all">All statuses</s-option>
                <s-option value="pending">Pending</s-option>
                <s-option value="flagged">Flagged</s-option>
                <s-option value="approved">Approved</s-option>
                <s-option value="rejected">Rejected</s-option>
              </s-select>
              <s-select label="Media type">
                <s-option value="all">All</s-option>
                <s-option value="photo">Photo reviews</s-option>
                <s-option value="video">Video reviews</s-option>
              </s-select>
              <s-select label="Source">
                <s-option value="all">All sources</s-option>
                <s-option value="account">Account prompt</s-option>
                <s-option value="post-purchase">Post-purchase prompt</s-option>
                <s-option value="pdp">Product page</s-option>
              </s-select>
            </div>
          </s-section>

          <s-section heading="Moderation queue">
            <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
              {(["all", "pending", "flagged", "approved", "rejected"] as const).map((value) => (
                <button
                  key={value}
                  onClick={() => setFilter(value)}
                  style={{
                    border: "1px solid",
                    borderColor: filter === value ? "#202223" : "#c9cccf",
                    background: filter === value ? "#202223" : "#fff",
                    color: filter === value ? "#fff" : "#202223",
                    borderRadius: "999px",
                    padding: "6px 12px",
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  {value === "all" ? "All" : value.charAt(0).toUpperCase() + value.slice(1)}
                </button>
              ))}
            </div>

            <s-stack direction="block" gap="base">
              {filteredReviews.map((review) => (
                <div
                  key={review.id}
                  style={{
                    border: "1px solid #e1e3e5",
                    borderRadius: "14px",
                    padding: "16px",
                    background: "#fff",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1.6fr) minmax(260px, 0.9fr)",
                      gap: "18px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "12px",
                          marginBottom: "10px",
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, marginBottom: "4px" }}>
                            {review.customer} - {review.product}
                          </div>
                          <div style={{ fontSize: "12px", color: "#5c5f62" }}>
                            {review.submittedAt} - {review.source}
                          </div>
                        </div>
                        <span
                          style={{
                            display: "inline-flex",
                            padding: "4px 10px",
                            borderRadius: "999px",
                            background: statusStyle[review.status].background,
                            color: statusStyle[review.status].color,
                            fontSize: "12px",
                            fontWeight: 600,
                            textTransform: "capitalize",
                          }}
                        >
                          {review.status}
                        </span>
                      </div>

                      <div style={{ color: "#d09100", fontSize: "17px", marginBottom: "8px" }}>
                        {stars(review.rating)}
                      </div>
                      <div style={{ fontWeight: 600, fontSize: "15px", marginBottom: "6px" }}>
                        {review.title}
                      </div>
                      <div style={{ fontSize: "13px", color: "#3d3f41", lineHeight: 1.6, marginBottom: "12px" }}>
                        {review.body}
                      </div>

                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {review.flags.map((flag) => (
                          <span
                            key={flag}
                            style={{
                              background: "#f6f6f7",
                              color: "#5c5f62",
                              borderRadius: "999px",
                              padding: "4px 10px",
                              fontSize: "12px",
                            }}
                          >
                            {flag}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div
                      style={{
                        border: "1px solid #eceeef",
                        borderRadius: "12px",
                        padding: "14px",
                        background: "#fafbfb",
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: "10px" }}>Media moderation</div>
                      <div style={{ fontSize: "13px", color: "#5c5f62", marginBottom: "12px" }}>
                        Photos: {review.media.photos} - Video: {review.media.video ? "Yes" : "No"}
                        {review.media.duration ? ` - ${review.media.duration}` : ""}
                      </div>
                      <div
                        style={{
                          borderRadius: "10px",
                          border: "1px dashed #c9cccf",
                          background: "#fff",
                          minHeight: "140px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          textAlign: "center",
                          padding: "12px",
                          marginBottom: "12px",
                        }}
                      >
                        {review.media.video ? (
                          <div>
                            <div style={{ fontWeight: 600, marginBottom: "4px" }}>
                              Video preview placeholder
                            </div>
                            <div style={{ fontSize: "12px", color: "#5c5f62" }}>
                              {review.media.moderation}
                            </div>
                          </div>
                        ) : (
                          <div style={{ fontSize: "12px", color: "#5c5f62" }}>
                            No video attached
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <s-button variant="primary">Approve review</s-button>
                        <s-button>Reject review</s-button>
                        <s-button>Approve video</s-button>
                        <s-button>Reject video</s-button>
                        <s-button>Reply publicly</s-button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </s-stack>
          </s-section>
        </>
      )}

      {activeTab === "approved" && (
        <s-section heading="Approved review content">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #d2d5d8" }}>
                  {["Customer", "Product", "Rating", "Media", "Source", "Published", ""].map((header) => (
                    <th
                      key={header}
                      style={{
                        textAlign: "left",
                        padding: "10px 12px",
                        color: "#5c5f62",
                        fontSize: "12px",
                        textTransform: "uppercase",
                      }}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reviews
                  .filter((review) => review.status === "approved")
                  .map((review) => (
                    <tr key={review.id} style={{ borderBottom: "1px solid #eceeef" }}>
                      <td style={{ padding: "12px", fontWeight: 600 }}>{review.customer}</td>
                      <td style={{ padding: "12px" }}>{review.product}</td>
                      <td style={{ padding: "12px" }}>{stars(review.rating)}</td>
                      <td style={{ padding: "12px" }}>
                        {review.media.video ? "Video" : review.media.photos ? "Photo" : "Text"}
                      </td>
                      <td style={{ padding: "12px" }}>{review.source}</td>
                      <td style={{ padding: "12px" }}>{review.submittedAt}</td>
                      <td style={{ padding: "12px" }}>
                        <s-button>View on storefront</s-button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </s-section>
      )}

      {activeTab === "settings" && (
        <>
          <s-section heading="Incentives">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
              <s-text-field
                label="Approved text review points"
                value={reviewPoints}
                onInput={(event: any) => setReviewPoints(event.target.value)}
              />
              <s-text-field
                label="Approved video bonus points"
                value={videoBonus}
                onInput={(event: any) => setVideoBonus(event.target.value)}
              />
            </div>
          </s-section>

          <s-section heading="Auto-flag rules">
            <s-stack direction="block" gap="base">
              <s-text-field
                label="Keyword trigger list"
                value={flagKeywords}
                onInput={(event: any) => setFlagKeywords(event.target.value)}
                details="Comma-separated keywords that should trigger manual moderation."
              />
              <s-text-field
                label="Flag ratings at or below"
                value={lowStarLimit}
                onInput={(event: any) => setLowStarLimit(event.target.value)}
              />
            </s-stack>
          </s-section>

          <s-section>
            <s-button variant="primary">Save review settings</s-button>
          </s-section>
        </>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
