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
      <s-section slot="aside" heading="Needs attention">
        <s-stack direction="block" gap="base">
          {d.reviewStats.flagged > 0 && (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "8px",
                background: "#fde8e8",
                border: "1px solid #b4231822",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: "13px", color: "#b42318", marginBottom: "2px" }}>
                {d.reviewStats.flagged} flagged review{d.reviewStats.flagged !== 1 ? "s" : ""}
              </div>
              <div style={{ fontSize: "12px", color: "#5c5f62" }}>Requires moderation action</div>
            </div>
          )}
          {d.reviewStats.pending > 0 && (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "8px",
                background: "#fff1d6",
                border: "1px solid #9a670022",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: "13px", color: "#9a6700", marginBottom: "2px" }}>
                {d.reviewStats.pending} pending review{d.reviewStats.pending !== 1 ? "s" : ""}
              </div>
              <div style={{ fontSize: "12px", color: "#5c5f62" }}>Awaiting approve or reject</div>
            </div>
          )}
          {d.expiringIn30Days > 0 && (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "8px",
                background: "#e8f2ff",
                border: "1px solid #005bd322",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: "13px", color: "#005bd3", marginBottom: "2px" }}>
                {d.expiringIn30Days} member{d.expiringIn30Days !== 1 ? "s" : ""} expiring
              </div>
              <div style={{ fontSize: "12px", color: "#5c5f62" }}>Points lapsing within 30 days</div>
            </div>
          )}
          {d.reviewStats.flagged === 0 && d.reviewStats.pending === 0 && d.expiringIn30Days === 0 && (
            <div style={{ fontSize: "13px", color: "#5c5f62" }}>
              Nothing needs attention right now.
            </div>
          )}
          <div style={{ borderTop: "1px solid #e1e3e5", paddingTop: "12px" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "#5c5f62", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Jump to
            </div>
            <s-stack direction="block" gap="tight">
              <s-button url="/app/reviews">Review queue</s-button>
              <s-button url="/app/loyalty">Loyalty settings</s-button>
            </s-stack>
          </div>
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

      {/* ── Quick actions ──────────────────────────────────────────── */}
      <s-section heading="Quick actions">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "10px",
          }}
        >
          {[
            { label: "Loyalty settings",   detail: "Tiers, multipliers, rules", href: "/app/loyalty",  color: "#005bd3" },
            { label: "Moderate reviews",   detail: "Approve, reject, reply",    href: "/app/reviews",  color: "#b42318" },
            { label: "Member table",       detail: "Browse & search members",   href: "/app/loyalty",  color: "#0a7d45" },
            { label: "Reward catalog",     detail: "Add or edit rewards",       href: "/app/loyalty",  color: "#9a6700" },
          ].map((action) => (
            <a
              key={action.label}
              href={action.href}
              style={{
                display: "block",
                padding: "16px",
                border: `1px solid ${action.color}22`,
                borderRadius: "10px",
                background: `${action.color}08`,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: "14px", color: action.color, marginBottom: "4px" }}>
                {action.label}
              </div>
              <div style={{ fontSize: "12px", color: "#5c5f62" }}>{action.detail}</div>
            </a>
          ))}
        </div>
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

      {/* ── Points at risk ─────────────────────────────────────────── */}
      <s-section heading="Points at risk">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "12px",
          }}
        >
          {[
            {
              label: "Expiring in 30 days",
              value: d.expiringIn30Days.toLocaleString(),
              detail: "members losing points soon",
              tone: "#b42318",
              bg: "#fde8e8",
            },
            {
              label: "Total in circulation",
              value: d.totalPointsInCirculation.toLocaleString(),
              detail: "points across all members",
              tone: "#005bd3",
              bg: "#e8f2ff",
            },
            {
              label: "Active rewards",
              value: d.activeRewardsCount.toLocaleString(),
              detail: "redemption options available",
              tone: "#0a7d45",
              bg: "#dff7e5",
            },
            {
              label: "Total redemptions",
              value: d.redemptionCount.toLocaleString(),
              detail: "all-time redemptions",
              tone: "#9a6700",
              bg: "#fff1d6",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                padding: "16px",
                borderRadius: "10px",
                background: stat.bg,
                border: `1px solid ${stat.tone}22`,
              }}
            >
              <div style={{ fontSize: "28px", fontWeight: 700, color: stat.tone, marginBottom: "6px" }}>
                {stat.value}
              </div>
              <div style={{ fontSize: "13px", fontWeight: 600, color: stat.tone, marginBottom: "2px" }}>
                {stat.label}
              </div>
              <div style={{ fontSize: "12px", color: "#5c5f62" }}>{stat.detail}</div>
            </div>
          ))}
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
