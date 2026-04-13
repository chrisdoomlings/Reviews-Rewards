import type { CSSProperties } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return {};
};

const programMetrics = [
  {
    label: "Active members",
    value: "18,420",
    trend: "+8.4%",
    detail: "1,248 purchased in the last 30 days",
    tone: "success",
  },
  {
    label: "Redeemable points",
    value: "7.8M",
    trend: "+11.2%",
    detail: "2,184 shoppers are above the first reward threshold",
    tone: "info",
  },
  {
    label: "Rewards claimed",
    value: "2,914",
    trend: "+4.1%",
    detail: "Top reward: $10 off coupon",
    tone: "success",
  },
  {
    label: "Pending reviews",
    value: "37",
    trend: "-6 today",
    detail: "5 include video and need manual approval",
    tone: "warning",
  },
];

const migrationChecklist = [
  {
    title: "Ends with Benefits parity",
    description:
      "Confirm imported tier names, thresholds, multipliers, and points currency before launch.",
    status: "Needs input",
  },
  {
    title: "Yotpo balance import",
    description:
      "Validate point balances and historical transactions on the development store before cutover.",
    status: "In review",
  },
  {
    title: "Pebble theme placement",
    description:
      "Verify app embed and product/account app blocks against the active Pebble version.",
    status: "Ready",
  },
];

const moderationSummary = [
  { label: "Approved today", value: "22" },
  { label: "Flagged by rule", value: "9" },
  { label: "Average rating", value: "4.7" },
  { label: "Video submissions", value: "14" },
];

const launchMilestones = [
  {
    name: "Infrastructure + migration prep",
    owner: "Developer",
    status: "In progress",
    due: "This week",
  },
  {
    name: "Loyalty admin parity pass",
    owner: "Product + Ops",
    status: "Needs review",
    due: "Next",
  },
  {
    name: "Reviews + video moderation",
    owner: "Support",
    status: "On track",
    due: "Next",
  },
  {
    name: "Theme extension QA",
    owner: "Lifecycle",
    status: "On track",
    due: "Next",
  },
];

const recentActivity = [
  {
    title: "Gold tier threshold draft updated",
    meta: "Loyalty settings",
    time: "12 minutes ago",
  },
  {
    title: "1,240 point reward redemption imported from Yotpo sample",
    meta: "Migration validation",
    time: "28 minutes ago",
  },
  {
    title: "Pebble product block placement verified on mobile PDP",
    meta: "Theme extension QA",
    time: "1 hour ago",
  },
  {
    title: "Moderation queue cleared for video reviews",
    meta: "Reviews queue",
    time: "2 hours ago",
  },
];

const toneColor: Record<string, string> = {
  success: "#0a7d45",
  info: "#005bd3",
  warning: "#b98900",
};

const statusTone: Record<string, { background: string; color: string }> = {
  Ready: { background: "#dff7e5", color: "#0a7d45" },
  "In review": { background: "#e8f2ff", color: "#005bd3" },
  "Needs input": { background: "#fff1d6", color: "#9a6700" },
  "In progress": { background: "#e8f2ff", color: "#005bd3" },
  "Needs review": { background: "#fff1d6", color: "#9a6700" },
  "On track": { background: "#dff7e5", color: "#0a7d45" },
  Blocked: { background: "#fde8e8", color: "#b42318" },
};

const styles = {
  metricGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: "12px",
  } satisfies CSSProperties,
  metricCard: {
    border: "1px solid #e1e3e5",
    borderRadius: "12px",
    padding: "16px",
    background: "linear-gradient(180deg, #ffffff 0%, #f6f6f7 100%)",
    minHeight: "132px",
  } satisfies CSSProperties,
  muted: {
    color: "#5c5f62",
    fontSize: "13px",
    lineHeight: 1.5,
  } satisfies CSSProperties,
  statusPill: (status: string) =>
    ({
      display: "inline-flex",
      alignItems: "center",
      padding: "3px 10px",
      borderRadius: "999px",
      background: statusTone[status].background,
      color: statusTone[status].color,
      fontSize: "12px",
      fontWeight: 600,
    }) satisfies CSSProperties,
};

export default function Dashboard() {
  return (
    <s-page heading="Admin overview">
      <s-section slot="aside" heading="Launch focus">
        <s-stack direction="block" gap="base">
          <s-banner heading="Go-live blockers" tone="warning">
            Confirm final Yotpo tier export and Pebble storefront placement before
            enabling any production-facing automations.
          </s-banner>
          <s-button variant="primary">Review migration checklist</s-button>
          <s-button>Open loyalty settings</s-button>
          <s-button>Moderate pending reviews</s-button>
        </s-stack>
      </s-section>

      <s-section heading="Program health">
        <div style={styles.metricGrid}>
          {programMetrics.map((metric) => (
            <div key={metric.label} style={styles.metricCard}>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "12px",
                  marginBottom: "20px",
                }}
              >
                <div>
                  <div style={{ fontSize: "13px", color: "#5c5f62", marginBottom: "8px" }}>
                    {metric.label}
                  </div>
                  <div style={{ fontSize: "30px", fontWeight: 700, color: "#202223" }}>
                    {metric.value}
                  </div>
                </div>
                <span
                  style={{
                    color: toneColor[metric.tone],
                    background: `${toneColor[metric.tone]}14`,
                    borderRadius: "999px",
                    padding: "4px 10px",
                    fontSize: "12px",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}
                >
                  {metric.trend}
                </span>
              </div>
              <div style={styles.muted}>{metric.detail}</div>
            </div>
          ))}
        </div>
      </s-section>

      <s-section heading="Migration readiness">
        <s-stack direction="block" gap="base">
          {migrationChecklist.map((item) => (
            <div
              key={item.title}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "16px",
                padding: "14px 16px",
                border: "1px solid #e1e3e5",
                borderRadius: "10px",
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: "14px", marginBottom: "4px" }}>
                  {item.title}
                </div>
                <div style={styles.muted}>{item.description}</div>
              </div>
              <span style={styles.statusPill(item.status)}>{item.status}</span>
            </div>
          ))}
        </s-stack>
      </s-section>

      <s-section heading="Reviews operations snapshot">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 2fr) minmax(260px, 1fr)",
            gap: "12px",
          }}
        >
          <div
            style={{
              border: "1px solid #e1e3e5",
              borderRadius: "12px",
              padding: "16px",
              background: "#ffffff",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: "10px",
              }}
            >
              {moderationSummary.map((item) => (
                <div
                  key={item.label}
                  style={{
                    padding: "14px",
                    borderRadius: "10px",
                    background: "#f6f6f7",
                  }}
                >
                  <div style={{ fontSize: "24px", fontWeight: 700, marginBottom: "4px" }}>
                    {item.value}
                  </div>
                  <div style={{ fontSize: "12px", color: "#5c5f62" }}>{item.label}</div>
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
            <div style={{ fontWeight: 600, marginBottom: "10px" }}>Channel health</div>
            <div style={{ ...styles.muted, marginBottom: "14px" }}>
              Product page and account-area prompts are driving most review volume.
              Support should keep pending reviews under 24 hours.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontSize: "12px", color: "#5c5f62" }}>Email CTR</span>
                  <span style={{ fontSize: "12px", fontWeight: 600 }}>18.2%</span>
                </div>
                <div style={{ height: "8px", borderRadius: "999px", background: "#e1e3e5" }}>
                  <div style={{ width: "72%", height: "100%", borderRadius: "999px", background: "#005bd3" }} />
                </div>
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontSize: "12px", color: "#5c5f62" }}>Submission completion</span>
                  <span style={{ fontSize: "12px", fontWeight: 600 }}>64%</span>
                </div>
                <div style={{ height: "8px", borderRadius: "999px", background: "#e1e3e5" }}>
                  <div style={{ width: "64%", height: "100%", borderRadius: "999px", background: "#0a7d45" }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </s-section>

      <s-section heading="Launch milestones">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #d2d5d8" }}>
                {["Milestone", "Owner", "Status", "Timing"].map((header) => (
                  <th
                    key={header}
                    style={{
                      textAlign: "left",
                      padding: "10px 12px",
                      color: "#5c5f62",
                      fontSize: "12px",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {launchMilestones.map((row) => (
                <tr key={row.name} style={{ borderBottom: "1px solid #eceeef" }}>
                  <td style={{ padding: "12px" }}>
                    <div style={{ fontWeight: 600 }}>{row.name}</div>
                  </td>
                  <td style={{ padding: "12px", color: "#5c5f62" }}>{row.owner}</td>
                  <td style={{ padding: "12px" }}>
                    <span style={styles.statusPill(row.status)}>{row.status}</span>
                  </td>
                  <td style={{ padding: "12px", color: "#5c5f62" }}>{row.due}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </s-section>

      <s-section heading="Recent activity">
        <s-stack direction="block" gap="base">
          {recentActivity.map((item) => (
            <div
              key={item.title}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "16px",
                alignItems: "flex-start",
                borderBottom: "1px solid #eceeef",
                paddingBottom: "12px",
              }}
            >
              <div>
                <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "3px" }}>
                  {item.title}
                </div>
                <div style={{ fontSize: "12px", color: "#5c5f62" }}>{item.meta}</div>
              </div>
              <div style={{ fontSize: "12px", color: "#5c5f62", whiteSpace: "nowrap" }}>
                {item.time}
              </div>
            </div>
          ))}
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
