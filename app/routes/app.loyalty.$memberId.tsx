import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useFetcher, useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getMemberDetail, adjustPoints, invalidateLoyaltyCache } from "../loyalty.server";

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { shop } = session;

  const member = await getMemberDetail(shop, params.memberId ?? "");
  if (!member) throw new Response("Member not found", { status: 404 });

  return {
    member: {
      id: member.id,
      shopifyCustomerId: member.shopifyCustomerId,
      email: member.email,
      firstName: member.firstName,
      lastName: member.lastName,
      tier: member.tier,
      pointsBalance: member.pointsBalance,
      pointsExpiresAt: member.pointsExpiresAt?.toISOString() ?? null,
      createdAt: member.createdAt.toISOString(),
      transactions: member.transactions.map((t) => ({
        id: t.id,
        type: t.type,
        points: t.points,
        description: t.description,
        createdAt: t.createdAt.toISOString(),
      })),
      redemptions: member.redemptions.map((r) => ({
        id: r.id,
        rewardName: r.reward.name,
        rewardType: r.reward.type,
        rewardValue: r.reward.value,
        pointsSpent: r.pointsSpent,
        discountCode: r.discountCode,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      })),
      reviews: member.reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        title: r.title,
        status: r.status,
        shopifyProductId: r.shopifyProductId,
        createdAt: r.createdAt.toISOString(),
      })),
    },
  };
};

// ─── Action ───────────────────────────────────────────────────────────────────

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { shop } = session;

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  switch (intent) {
    case "adjust-points": {
      const delta = Number(formData.get("delta"));
      const reason = String(formData.get("reason") ?? "");
      if (isNaN(delta) || delta === 0) {
        return Response.json({ error: "Invalid adjustment amount" }, { status: 400 });
      }
      await adjustPoints(shop, params.memberId ?? "", delta, reason);
      invalidateLoyaltyCache(shop);
      return Response.json({ ok: true });
    }
    default:
      return Response.json({ error: "Unknown intent" }, { status: 400 });
  }
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const TIER_COLORS: Record<string, { color: string; bg: string }> = {
  prepper:  { color: "#5c5f62", bg: "#f6f6f7" },
  survivor: { color: "#1a5c2e", bg: "#e8f5ed" },
  ruler:    { color: "#7c4b00", bg: "#fff4e0" },
};
const tc = (name: string) => TIER_COLORS[name.toLowerCase()] ?? { color: "#5c5f62", bg: "#f6f6f7" };

const muted = { fontSize: "13px", color: "#5c5f62" } as const;
const th    = { textAlign: "left" as const, padding: "10px 12px", color: "#5c5f62", fontSize: "12px", textTransform: "uppercase" as const, letterSpacing: "0.04em" };
const td    = { padding: "12px", fontSize: "13px" };

// ─── Component ────────────────────────────────────────────────────────────────

export default function MemberDetail() {
  const { member } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const navigate = useNavigate();
  const submitting = fetcher.state !== "idle";

  const name = [member.firstName, member.lastName].filter(Boolean).join(" ") || member.email;
  const { color, bg } = tc(member.tier);

  const totalEarned  = member.transactions.filter((t) => t.points > 0).reduce((s, t) => s + t.points, 0);
  const totalSpent   = member.transactions.filter((t) => t.points < 0).reduce((s, t) => s + Math.abs(t.points), 0);

  return (
    <s-page heading={name} back-action-url="/app/loyalty?tab=members">

      {/* ── Identity card ──────────────────────────────────────────────── */}
      <s-section>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
          {[
            {
              label: "Points balance",
              value: member.pointsBalance.toLocaleString(),
              large: true,
              tone: "#005bd3",
            },
            {
              label: "Tier",
              value: member.tier.charAt(0).toUpperCase() + member.tier.slice(1),
              badge: true,
            },
            {
              label: "Total earned",
              value: `+${totalEarned.toLocaleString()}`,
              tone: "#0a7d45",
            },
            {
              label: "Total spent",
              value: `-${totalSpent.toLocaleString()}`,
              tone: "#b42318",
            },
            {
              label: "Reviews",
              value: String(member.reviews.length),
            },
            {
              label: "Redemptions",
              value: String(member.redemptions.length),
            },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{ padding: "16px", border: "1px solid #e1e3e5", borderRadius: "12px", background: "#fff" }}
            >
              <div style={{ ...muted, marginBottom: "6px" }}>{stat.label}</div>
              {stat.badge ? (
                <span style={{ background: bg, color, borderRadius: "999px", padding: "4px 12px", fontSize: "14px", fontWeight: 700 }}>
                  {stat.value}
                </span>
              ) : (
                <div style={{ fontSize: stat.large ? "30px" : "22px", fontWeight: 700, color: stat.tone ?? "#202223" }}>
                  {stat.value}
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ marginTop: "14px", ...muted }}>
          <span>{member.email}</span>
          {member.pointsExpiresAt && (
            <span style={{ marginLeft: "16px", color: "#9a6700" }}>
              Points expire {new Date(member.pointsExpiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          )}
          <span style={{ marginLeft: "16px" }}>
            Member since {new Date(member.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
        </div>
      </s-section>

      {/* ── Adjust points ──────────────────────────────────────────────── */}
      <s-section heading="Adjust points">
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="adjust-points" />
          <div style={{ display: "grid", gridTemplateColumns: "140px 1fr auto", gap: "12px", alignItems: "flex-end" }}>
            <s-text-field
              label="Amount"
              name="delta"
              placeholder="+100 or -50"
              details="Use negative to deduct"
            />
            <s-text-field
              label="Reason"
              name="reason"
              placeholder="e.g. Goodwill adjustment, contest prize…"
            />
            <s-button variant="primary" type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Apply"}
            </s-button>
          </div>
          {fetcher.data?.error && (
            <div style={{ marginTop: "8px", color: "#b42318", fontSize: "13px" }}>{fetcher.data.error}</div>
          )}
          {fetcher.data?.ok && (
            <div style={{ marginTop: "8px", color: "#0a7d45", fontSize: "13px" }}>Points updated.</div>
          )}
        </fetcher.Form>
      </s-section>

      {/* ── Transaction history ────────────────────────────────────────── */}
      <s-section heading={`Transaction history (${member.transactions.length})`}>
        {member.transactions.length === 0 ? (
          <div style={{ ...muted, padding: "16px 0" }}>No transactions yet.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #d2d5d8" }}>
                  {["Date", "Type", "Description", "Points"].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {member.transactions.map((t) => {
                  const positive = t.points > 0;
                  const typeColor = t.type === "earn" ? "#0a7d45" : t.type === "redeem" ? "#b42318" : t.type === "expire" ? "#9a6700" : "#5c5f62";
                  return (
                    <tr key={t.id} style={{ borderBottom: "1px solid #eceeef" }}>
                      <td style={td}>{new Date(t.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                      <td style={td}>
                        <span style={{ background: `${typeColor}18`, color: typeColor, borderRadius: "999px", padding: "2px 8px", fontSize: "11px", fontWeight: 600, textTransform: "capitalize" }}>
                          {t.type}
                        </span>
                      </td>
                      <td style={{ ...td, color: "#5c5f62" }}>{t.description ?? "—"}</td>
                      <td style={{ ...td, fontWeight: 700, color: positive ? "#0a7d45" : "#b42318" }}>
                        {positive ? "+" : ""}{t.points.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </s-section>

      {/* ── Redemptions ────────────────────────────────────────────────── */}
      {member.redemptions.length > 0 && (
        <s-section heading={`Redemptions (${member.redemptions.length})`}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #d2d5d8" }}>
                  {["Date", "Reward", "Points spent", "Discount code", "Status"].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {member.redemptions.map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid #eceeef" }}>
                    <td style={td}>{new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{r.rewardName}</td>
                    <td style={{ ...td, color: "#b42318", fontWeight: 700 }}>-{r.pointsSpent.toLocaleString()}</td>
                    <td style={td}>
                      {r.discountCode
                        ? <code style={{ background: "#f6f6f7", padding: "2px 6px", borderRadius: "4px", fontSize: "12px", fontFamily: "monospace" }}>{r.discountCode}</code>
                        : <span style={{ color: "#9ca3af" }}>—</span>}
                    </td>
                    <td style={td}>
                      <span style={{
                        background: r.status === "fulfilled" ? "#dff7e5" : r.status === "cancelled" ? "#eceeef" : "#fff1d6",
                        color: r.status === "fulfilled" ? "#0a7d45" : r.status === "cancelled" ? "#5c5f62" : "#9a6700",
                        borderRadius: "999px", padding: "2px 8px", fontSize: "11px", fontWeight: 600, textTransform: "capitalize",
                      }}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </s-section>
      )}

      {/* ── Reviews ────────────────────────────────────────────────────── */}
      {member.reviews.length > 0 && (
        <s-section heading={`Reviews (${member.reviews.length})`}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #d2d5d8" }}>
                  {["Date", "Product", "Rating", "Title", "Status"].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {member.reviews.map((r) => {
                  const statusColor = r.status === "approved" ? "#0a7d45" : r.status === "rejected" ? "#b42318" : "#9a6700";
                  const statusBg   = r.status === "approved" ? "#dff7e5" : r.status === "rejected" ? "#fde8e8" : "#fff1d6";
                  return (
                    <tr key={r.id} style={{ borderBottom: "1px solid #eceeef" }}>
                      <td style={td}>{new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                      <td style={{ ...td, color: "#5c5f62", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.shopifyProductId === "site" ? "Store review" : r.shopifyProductId}
                      </td>
                      <td style={td}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</td>
                      <td style={{ ...td, color: "#5c5f62" }}>{r.title ?? "—"}</td>
                      <td style={td}>
                        <span style={{ background: statusBg, color: statusColor, borderRadius: "999px", padding: "2px 8px", fontSize: "11px", fontWeight: 600, textTransform: "capitalize" }}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
