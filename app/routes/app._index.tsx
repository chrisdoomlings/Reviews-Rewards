import type { CSSProperties } from "react";
import type { HeadersFunction, LoaderFunctionArgs, ShouldRevalidateFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { getOverviewStats, getDashboardExtras } from "../loyalty.server";
import { getReviewStats } from "../reviews.server";

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { shop } = session;

  // All three functions are cached (60–120 s TTL) so subsequent navigations
  // back to the dashboard are served from memory, not from Supabase.
  const [loyaltyStats, reviewStats, extras] = await Promise.all([
    getOverviewStats(shop),
    getReviewStats(shop),
    getDashboardExtras(shop),
  ]);

  return {
    totalMembers:             loyaltyStats.totalMembers,
    totalPointsInCirculation: extras.totalPointsInCirculation,
    expiringIn30Days:         loyaltyStats.expiringIn30Days,
    activeRewardsCount:       loyaltyStats.activeRewardsCount,
    redemptionCount:          extras.redemptionCount,
    redeemingCustomers:       extras.redeemingCustomers,
    tierCounts:               extras.tierCounts,
    participationRate:        extras.participationRate,
    reviewStats,
    recentTransactions:       extras.recentTransactions,
  };
};

// Don't re-run the dashboard loader when navigating between tabs —
// the cached stats are fresh enough for an admin overview.
// The loader will still run on mutations (POST/PATCH/DELETE) or hard refresh.
export function shouldRevalidate({ formMethod }: ShouldRevalidateFunctionArgs) {
  if (formMethod && formMethod.toUpperCase() !== "GET") return true;
  return false;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  muted: { color: "#5c5f62", fontSize: "13px", lineHeight: 1.5 } satisfies CSSProperties,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtK(n: number): string {
  if (n >= 1000) {
    const k = Math.round(n / 100) / 10;
    return k + "k";
  }
  return String(n);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const d = useLoaderData<typeof loader>();

  const totalMembers = d.totalMembers;
  const redeemPct = totalMembers > 0 ? Math.round((d.redeemingCustomers / totalMembers) * 100) : 0;

  // Tier order — base first, then ascending
  const tierOrder = ["base", "bronze", "silver", "gold", "platinum", "diamond"];
  const tierEntries = Object.entries(d.tierCounts).sort(
    (a, b) => tierOrder.indexOf(a[0]) - tierOrder.indexOf(b[0])
  );
  const tierColors: Record<string, string> = {
    base: "#9ca3af", bronze: "#b45309", silver: "#6b7280",
    gold: "#d97706", platinum: "#7c3aed", diamond: "#0ea5e9",
  };

  return (
    <s-page heading="Admin overview">
      {/* ── Aside: needs attention ─────────────────────────────────── */}
      <s-section slot="aside" heading="Needs attention">
        <s-stack direction="block" gap="base">
          {d.reviewStats.flagged > 0 && (
            <div style={{ padding: "12px 14px", borderRadius: "8px", background: "#fde8e8", border: "1px solid #b4231822" }}>
              <div style={{ fontWeight: 700, fontSize: "13px", color: "#b42318", marginBottom: "2px" }}>
                {d.reviewStats.flagged} flagged review{d.reviewStats.flagged !== 1 ? "s" : ""}
              </div>
              <div style={{ fontSize: "12px", color: "#5c5f62" }}>Requires moderation action</div>
            </div>
          )}
          {d.reviewStats.pending > 0 && (
            <div style={{ padding: "12px 14px", borderRadius: "8px", background: "#fff1d6", border: "1px solid #9a670022" }}>
              <div style={{ fontWeight: 700, fontSize: "13px", color: "#9a6700", marginBottom: "2px" }}>
                {d.reviewStats.pending} pending review{d.reviewStats.pending !== 1 ? "s" : ""}
              </div>
              <div style={{ fontSize: "12px", color: "#5c5f62" }}>Awaiting approve or reject</div>
            </div>
          )}
          {d.expiringIn30Days > 0 && (
            <div style={{ padding: "12px 14px", borderRadius: "8px", background: "#e8f2ff", border: "1px solid #005bd322" }}>
              <div style={{ fontWeight: 700, fontSize: "13px", color: "#005bd3", marginBottom: "2px" }}>
                {d.expiringIn30Days} member{d.expiringIn30Days !== 1 ? "s" : ""} expiring
              </div>
              <div style={{ fontSize: "12px", color: "#5c5f62" }}>Points lapsing within 30 days</div>
            </div>
          )}
          {d.reviewStats.flagged === 0 && d.reviewStats.pending === 0 && d.expiringIn30Days === 0 && (
            <div style={{ fontSize: "13px", color: "#5c5f62" }}>Nothing needs attention right now.</div>
          )}
          <div style={{ borderTop: "1px solid #e1e3e5", paddingTop: "12px" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "#5c5f62", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Jump to
            </div>
            <s-stack direction="block" gap="tight">
              <s-button url="/app/reviews">Review queue</s-button>
              <s-button url="/app/loyalty">Loyalty settings</s-button>
              <s-button url="/app/analytics">Analytics</s-button>
            </s-stack>
          </div>
        </s-stack>
      </s-section>

      {/* ══ LOYALTY PROGRAM ════════════════════════════════════════════ */}
      <s-section heading="Loyalty program">
        {/* Key metrics row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", marginBottom: "20px" }}>
          {[
            { label: "Total members",       value: fmtK(totalMembers),             detail: "all-time sign-ups",              tone: "#005bd3", bg: "#e8f2ff" },
            { label: "Redeeming customers", value: fmtK(d.redeemingCustomers),      detail: `${redeemPct}% of members`,       tone: "#0a7d45", bg: "#dff7e5" },
            { label: "Participation rate",  value: `${d.participationRate}%`,        detail: "members with earn activity",     tone: "#7c3aed", bg: "#f3e8ff" },
            { label: "Points in circulation", value: fmtK(d.totalPointsInCirculation), detail: "current unredeemed balance",  tone: "#9a6700", bg: "#fff1d6" },
          ].map((m) => (
            <div key={m.label} style={{ padding: "16px", borderRadius: "10px", background: m.bg, border: `1px solid ${m.tone}22` }}>
              <div style={{ fontSize: "13px", color: "#5c5f62", marginBottom: "6px" }}>{m.label}</div>
              <div style={{ fontSize: "28px", fontWeight: 700, color: m.tone, marginBottom: "4px" }}>{m.value}</div>
              <div style={{ fontSize: "11px", color: "#6b7280" }}>{m.detail}</div>
            </div>
          ))}
        </div>

        {/* Tier breakdown */}
        {tierEntries.length > 0 && (
          <div style={{ marginBottom: "20px" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "#5c5f62", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "10px" }}>
              Members by tier
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {tierEntries.map(([tier, count]) => {
                const color = tierColors[tier] ?? "#6b7280";
                const pct   = totalMembers > 0 ? Math.round((count / totalMembers) * 100) : 0;
                return (
                  <div
                    key={tier}
                    style={{
                      padding: "10px 16px",
                      borderRadius: "8px",
                      border: `1px solid ${color}33`,
                      background: `${color}11`,
                      minWidth: "90px",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ fontSize: "18px", fontWeight: 700, color }}>{fmtK(count)}</div>
                    <div style={{ fontSize: "11px", fontWeight: 600, color, marginTop: "2px", textTransform: "capitalize" }}>{tier}</div>
                    <div style={{ fontSize: "10px", color: "#9ca3af", marginTop: "1px" }}>{pct}%</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Secondary stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px" }}>
          {[
            { label: "Active rewards",     value: fmtK(d.activeRewardsCount), detail: "in reward catalog" },
            { label: "Total redemptions",  value: fmtK(d.redemptionCount),    detail: "all-time" },
            { label: "Expiring in 30 days", value: fmtK(d.expiringIn30Days), detail: "members at risk" },
          ].map((s) => (
            <div key={s.label} style={{ padding: "14px", borderRadius: "10px", background: "#f6f6f7", border: "1px solid #e1e3e5" }}>
              <div style={{ fontSize: "22px", fontWeight: 700, marginBottom: "4px" }}>{s.value}</div>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "2px" }}>{s.label}</div>
              <div style={{ fontSize: "11px", color: "#6b7280" }}>{s.detail}</div>
            </div>
          ))}
        </div>
      </s-section>

      {/* ══ REVIEWS ════════════════════════════════════════════════════ */}
      <s-section heading="Reviews">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px" }}>
          {[
            { label: "Pending",        value: fmtK(d.reviewStats.pending),       tone: d.reviewStats.pending > 0 ? "#9a6700" : "#0a7d45", bg: d.reviewStats.pending > 0 ? "#fff1d6" : "#f6f6f7" },
            { label: "Flagged",        value: fmtK(d.reviewStats.flagged),        tone: d.reviewStats.flagged > 0 ? "#b42318" : "#0a7d45", bg: d.reviewStats.flagged > 0 ? "#fde8e8" : "#f6f6f7" },
            { label: "Approved today", value: fmtK(d.reviewStats.approvedToday), tone: "#0a7d45", bg: "#f6f6f7" },
            { label: "Avg rating",     value: d.reviewStats.avgRating ? `${d.reviewStats.avgRating} ★` : "—", tone: "#9a6700", bg: "#fff7ed" },
          ].map((item) => (
            <div key={item.label} style={{ padding: "14px", borderRadius: "10px", background: item.bg, border: `1px solid ${item.tone}22` }}>
              <div style={{ fontSize: "24px", fontWeight: 700, color: item.tone, marginBottom: "4px" }}>{item.value}</div>
              <div style={{ fontSize: "12px", color: "#5c5f62" }}>{item.label}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: "12px" }}>
          <a href="/app/reviews" style={{ fontSize: "13px", color: "#005bd3", textDecoration: "none", fontWeight: 500 }}>
            Go to review queue →
          </a>
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
                  <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "3px" }}>{item.label}</div>
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
