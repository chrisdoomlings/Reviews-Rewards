import type { CSSProperties } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { getOverviewStats } from "../loyalty.server";
import { getReviewStats } from "../reviews.server";
import prisma from "../db.server";

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { shop } = session;

  const [loyaltyStats, reviewStats, balanceAgg, redemptionCount, recentTransactions] =
    await Promise.all([
      getOverviewStats(shop),
      getReviewStats(shop),
      // Sum of current points balances across all customers
      prisma.customer.aggregate({ where: { shop }, _sum: { pointsBalance: true } }),
      // Total redemptions ever made
      prisma.redemption.count({ where: { customer: { shop } } }),
      // Last 5 earn transactions for the activity feed
      prisma.transaction.findMany({
        where: { customer: { shop }, type: "earn" },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { customer: { select: { email: true, firstName: true, lastName: true } } },
      }),
    ]);

  return {
    totalMembers: loyaltyStats.totalMembers,
    totalPointsInCirculation: balanceAgg._sum.pointsBalance ?? 0,
    expiringIn30Days: loyaltyStats.expiringIn30Days,
    activeRewardsCount: loyaltyStats.activeRewardsCount,
    redemptionCount,
    reviewStats,
    recentTransactions: recentTransactions.map((t) => {
      const name = t.customer
        ? [t.customer.firstName, t.customer.lastName].filter(Boolean).join(" ") ||
          t.customer.email
        : "Unknown";
      return {
        id: t.id,
        label: `${name} — ${t.points.toLocaleString()} pts`,
        meta: t.description ?? "Earn event",
        time: t.createdAt.toISOString(),
      };
    }),
  };
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const statusTone: Record<string, { background: string; color: string }> = {
  Ready:          { background: "#dff7e5", color: "#0a7d45" },
  "In review":    { background: "#e8f2ff", color: "#005bd3" },
  "Needs input":  { background: "#fff1d6", color: "#9a6700" },
  "In progress":  { background: "#e8f2ff", color: "#005bd3" },
  "Needs review": { background: "#fff1d6", color: "#9a6700" },
  "On track":     { background: "#dff7e5", color: "#0a7d45" },
  Blocked:        { background: "#fde8e8", color: "#b42318" },
};

const styles = {
  metricCard: {
    border: "1px solid #e1e3e5",
    borderRadius: "12px",
    padding: "16px",
    background: "linear-gradient(180deg, #ffffff 0%, #f6f6f7 100%)",
  } satisfies CSSProperties,
  muted: { color: "#5c5f62", fontSize: "13px", lineHeight: 1.5 } satisfies CSSProperties,
  statusPill: (status: string): CSSProperties => ({
    display: "inline-flex",
    padding: "3px 10px",
    borderRadius: "999px",
    background: statusTone[status]?.background ?? "#eceeef",
    color: statusTone[status]?.color ?? "#5c5f62",
    fontSize: "12px",
    fontWeight: 600,
  }),
};

// ─── Editorial content (project-state, not DB data) ───────────────────────────

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

const launchMilestones = [
  { name: "Schema + points engine",            owner: "Developer",    status: "In progress", due: "Done" },
  { name: "Loyalty admin dashboard",           owner: "Developer",    status: "In progress", due: "Done" },
  { name: "Reviews + video moderation",        owner: "Support",      status: "In progress", due: "Done" },
  { name: "Theme extension / storefront widget", owner: "Developer",  status: "Needs review", due: "Next" },
  { name: "Multipass / OTC login",             owner: "Developer",    status: "Needs input",  due: "Next" },
  { name: "Yotpo data migration",              owner: "Product + Ops", status: "Needs input", due: "TBD" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const d = useLoaderData<typeof loader>();

  const programMetrics = [
    {
      label: "Total members",
      value: d.totalMembers.toLocaleString(),
      detail: `${d.expiringIn30Days.toLocaleString()} expiring in 30 days`,
      tone: "#005bd3",
    },
    {
      label: "Points in circulation",
      value: d.totalPointsInCirculation.toLocaleString(),
      detail: `${d.activeRewardsCount} reward${d.activeRewardsCount !== 1 ? "s" : ""} in catalog`,
      tone: "#0a7d45",
    },
    {
      label: "Redemptions",
      value: d.redemptionCount.toLocaleString(),
      detail: `${d.activeRewardsCount} active reward${d.activeRewardsCount !== 1 ? "s" : ""}`,
      tone: "#9a6700",
    },
    {
      label: "Pending reviews",
      value: d.reviewStats.pending.toLocaleString(),
      detail: `${d.reviewStats.flagged} flagged · avg ${d.reviewStats.avgRating || "—"} stars`,
      tone: d.reviewStats.pending > 0 ? "#b42318" : "#0a7d45",
    },
  ];

  const moderationSummary = [
    { label: "Approved today", value: d.reviewStats.approvedToday.toLocaleString() },
    { label: "Flagged",        value: d.reviewStats.flagged.toLocaleString() },
    { label: "Avg rating",     value: d.reviewStats.avgRating ? String(d.reviewStats.avgRating) : "—" },
    { label: "Pending",        value: d.reviewStats.pending.toLocaleString() },
  ];

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

      {/* ── Program health ─────────────────────────────────────────── */}
      <s-section heading="Program health">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "12px",
          }}
        >
          {programMetrics.map((metric) => (
            <div key={metric.label} style={styles.metricCard}>
              <div style={{ fontSize: "13px", color: "#5c5f62", marginBottom: "8px" }}>
                {metric.label}
              </div>
              <div
                style={{ fontSize: "30px", fontWeight: 700, color: metric.tone, marginBottom: "12px" }}
              >
                {metric.value}
              </div>
              <div style={styles.muted}>{metric.detail}</div>
            </div>
          ))}
        </div>
      </s-section>

      {/* ── Migration readiness ────────────────────────────────────── */}
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

      {/* ── Reviews snapshot ───────────────────────────────────────── */}
      <s-section heading="Reviews snapshot">
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
              style={{ padding: "14px", borderRadius: "10px", background: "#f6f6f7" }}
            >
              <div style={{ fontSize: "24px", fontWeight: 700, marginBottom: "4px" }}>
                {item.value}
              </div>
              <div style={{ fontSize: "12px", color: "#5c5f62" }}>{item.label}</div>
            </div>
          ))}
        </div>
      </s-section>

      {/* ── Launch milestones ──────────────────────────────────────── */}
      <s-section heading="Launch milestones">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #d2d5d8" }}>
                {["Milestone", "Owner", "Status", "Timing"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "10px 12px",
                      color: "#5c5f62",
                      fontSize: "12px",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {launchMilestones.map((row) => (
                <tr key={row.name} style={{ borderBottom: "1px solid #eceeef" }}>
                  <td style={{ padding: "12px", fontWeight: 600 }}>{row.name}</td>
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

      {/* ── Recent earn activity ───────────────────────────────────── */}
      <s-section heading="Recent earn activity">
        {d.recentTransactions.length === 0 ? (
          <div style={{ ...styles.muted, padding: "16px 0" }}>
            No earn activity yet — transactions will appear here after the first order or approved review.
          </div>
        ) : (
          <s-stack direction="block" gap="base">
            {d.recentTransactions.map((item) => (
              <div
                key={item.id}
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
                    {item.label}
                  </div>
                  <div style={{ fontSize: "12px", color: "#5c5f62" }}>{item.meta}</div>
                </div>
                <div style={{ fontSize: "12px", color: "#5c5f62", whiteSpace: "nowrap" }}>
                  {new Date(item.time).toLocaleString()}
                </div>
              </div>
            ))}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
