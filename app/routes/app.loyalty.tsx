import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { Form, useLoaderData, useFetcher } from "react-router";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  getShopConfig,
  saveShopConfig,
  getOverviewStats,
  getTierCounts,
  getMembers,
  getRewards,
  createReward,
  updateReward,
  toggleRewardActive,
  deleteReward,
  type ShopConfigData,
  type TierConfig,
} from "../loyalty.server";

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { shop } = session;

  const url = new URL(request.url);
  const search = url.searchParams.get("search") ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));

  const [overviewStats, tierCounts, membersData, rewards, shopConfig] =
    await Promise.all([
      getOverviewStats(shop),
      getTierCounts(shop),
      getMembers(shop, { search, page }),
      getRewards(shop),
      getShopConfig(shop),
    ]);

  return {
    shop,
    search,
    overviewStats,
    tierCounts,
    ...membersData,
    rewards,
    shopConfig,
  };
};

// ─── Action ───────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { shop } = session;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  switch (intent) {
    case "save-settings": {
      await saveShopConfig(shop, {
        pointsCurrencyName: String(formData.get("pointsCurrencyName") || "Doom Points"),
        expiryMonths: Number(formData.get("expiryMonths") || 12),
        expiryWarningDays: Number(formData.get("expiryWarningDays") || 30),
        launcherPromptsEnabled: formData.get("launcherPromptsEnabled") === "true",
        silentReauthDays: Number(formData.get("silentReauthDays") || 30),
      });
      return Response.json({ ok: true });
    }

    case "save-tiers": {
      const tiers = JSON.parse(String(formData.get("tiers"))) as TierConfig[];
      await saveShopConfig(shop, { tiers });
      return Response.json({ ok: true });
    }

    case "save-rules": {
      await saveShopConfig(shop, {
        earningRules: {
          basePointsPerDollar:   Number(formData.get("basePointsPerDollar")   || 1),
          purchaseEnabled:        formData.get("purchaseEnabled")  === "true",
          textReviewEnabled:      formData.get("textReviewEnabled") === "true",
          textReviewPoints:      Number(formData.get("textReviewPoints")      || 20),
          photoReviewPoints:     Number(formData.get("photoReviewPoints")     || 20),
          videoReviewEnabled:     formData.get("videoReviewEnabled") === "true",
          videoReviewPoints:     Number(formData.get("videoReviewPoints")     || 25),
          createAccountPoints:   Number(formData.get("createAccountPoints")   || 10),
          smsSignupPoints:       Number(formData.get("smsSignupPoints")       || 25),
          facebookSharePoints:   Number(formData.get("facebookSharePoints")   || 10),
          facebookGroupPoints:   Number(formData.get("facebookGroupPoints")   || 10),
          instagramFollowPoints: Number(formData.get("instagramFollowPoints") || 10),
          tiktokFollowPoints:    Number(formData.get("tiktokFollowPoints")    || 10),
          discordJoinPoints:     Number(formData.get("discordJoinPoints")     || 10),
          twitchFollowPoints:    Number(formData.get("twitchFollowPoints")    || 10),
          birthdayPoints:        Number(formData.get("birthdayPoints")        || 50),
          referralPoints:        Number(formData.get("referralPoints")        || 200),
        },
      });
      return Response.json({ ok: true });
    }

    case "create-reward": {
      await createReward(shop, {
        name: String(formData.get("name") || ""),
        description: String(formData.get("description") || ""),
        type: String(formData.get("type") || "discount_pct"),
        value: String(formData.get("value") || ""),
        pointsCost: Number(formData.get("pointsCost") || 0),
      });
      return Response.json({ ok: true });
    }

    case "update-reward": {
      await updateReward(String(formData.get("id")), {
        name: String(formData.get("name") || ""),
        description: String(formData.get("description") || ""),
        type: String(formData.get("type") || "discount_pct"),
        value: String(formData.get("value") || ""),
        pointsCost: Number(formData.get("pointsCost") || 0),
      });
      return Response.json({ ok: true });
    }

    case "toggle-reward": {
      await toggleRewardActive(
        String(formData.get("id")),
        formData.get("isActive") === "true",
      );
      return Response.json({ ok: true });
    }

    case "delete-reward": {
      await deleteReward(String(formData.get("id")));
      return Response.json({ ok: true });
    }

    default:
      return Response.json({ error: "Unknown intent" }, { status: 400 });
  }
};

// ─── Constants ────────────────────────────────────────────────────────────────

type Tab = "overview" | "members" | "rules" | "rewards" | "tiers" | "referrals" | "settings";

const TIER_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  prepper:  { color: "#5c5f62", bg: "#f6f6f7", border: "#c9cccf" },
  survivor: { color: "#1a5c2e", bg: "#e8f5ed", border: "#1a5c2e33" },
  ruler:    { color: "#7c4b00", bg: "#fff4e0", border: "#7c4b0033" },
};
const fallbackColor = { color: "#5c5f62", bg: "#f6f6f7", border: "#e1e3e5" };
const tc = (name: string) => TIER_COLORS[name.toLowerCase()] ?? fallbackColor;

const REWARD_TYPES = [
  { value: "discount_pct",   label: "% discount" },
  { value: "discount_fixed", label: "Fixed $ off" },
  { value: "free_shipping",  label: "Free shipping" },
  { value: "free_product",   label: "Free product" },
];

const styles = {
  tabBar: {
    display: "flex",
    borderBottom: "1px solid #e1e3e5",
    margin: "-16px -16px 0",
    overflowX: "auto",
  } satisfies CSSProperties,
  tab: (active: boolean): CSSProperties => ({
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
  card: {
    padding: "16px",
    border: "1px solid #e1e3e5",
    borderRadius: "12px",
    background: "#fff",
  } satisfies CSSProperties,
  grid: (cols: string): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: cols,
    gap: "12px",
  }),
  muted: { fontSize: "13px", color: "#5c5f62" } satisfies CSSProperties,
  pill: (active: boolean): CSSProperties => ({
    display: "inline-flex",
    padding: "3px 10px",
    borderRadius: "999px",
    background: active ? "#dff7e5" : "#eceeef",
    color: active ? "#0a7d45" : "#5c5f62",
    fontSize: "12px",
    fontWeight: 600,
  }),
  th: {
    textAlign: "left",
    padding: "10px 12px",
    color: "#5c5f62",
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  } satisfies CSSProperties,
  td: { padding: "12px" } satisfies CSSProperties,
};

const EMPTY_REWARD = { name: "", description: "", type: "discount_pct", value: "", pointsCost: "" };

// ─── Component ────────────────────────────────────────────────────────────────

export default function Loyalty() {
  const data = useLoaderData<typeof loader>();
  const { overviewStats, tierCounts, members, memberTotal, memberPage, memberPageSize,
          rewards, shopConfig } = data;

  const fetcher = useFetcher<{ ok?: boolean }>();
  const submitting = fetcher.state !== "idle";

  // UI state
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [rewardMode, setRewardMode] = useState<"none" | "add" | string>("none"); // "add" | rewardId
  const [rewardForm, setRewardForm] = useState(EMPTY_REWARD);
  const [editingTier, setEditingTier] = useState<string | null>(null);
  const [tierForms, setTierForms] = useState<Record<string, { displayName: string; minPoints: string; earnMultiplier: string; entryRewardPoints: string; birthdayRewardPoints: string }>>({});

  // Settings form — pre-seeded from loader data
  const [settingsForm, setSettingsForm] = useState({
    pointsCurrencyName: shopConfig.pointsCurrencyName,
    expiryMonths: String(shopConfig.expiryMonths),
    expiryWarningDays: String(shopConfig.expiryWarningDays),
    launcherPromptsEnabled: shopConfig.launcherPromptsEnabled,
    silentReauthDays: String(shopConfig.silentReauthDays),
  });

  // Close reward form after successful save
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      setRewardMode("none");
      setRewardForm(EMPTY_REWARD);
      setEditingTier(null);
    }
  }, [fetcher.state, fetcher.data]);

  const openAddReward = () => { setRewardForm(EMPTY_REWARD); setRewardMode("add"); };
  const openEditReward = (r: typeof rewards[number]) => {
    setRewardForm({ name: r.name, description: r.description ?? "", type: r.type, value: r.value, pointsCost: String(r.pointsCost) });
    setRewardMode(r.id);
  };
  const openEditTier = (t: TierConfig) => {
    setTierForms((prev) => ({
      ...prev,
      [t.name]: {
        displayName:          t.displayName,
        minPoints:            String(t.minPoints),
        earnMultiplier:       String(t.earnMultiplier),
        entryRewardPoints:    String(t.entryRewardPoints),
        birthdayRewardPoints: String(t.birthdayRewardPoints),
      },
    }));
    setEditingTier(t.name);
  };
  const saveTier = (tierName: string) => {
    const f = tierForms[tierName];
    if (!f) return;
    const updatedTiers = shopConfig.tiers.map((t) =>
      t.name === tierName
        ? {
            ...t,
            displayName:          f.displayName,
            minPoints:            Number(f.minPoints),
            earnMultiplier:       Number(f.earnMultiplier),
            entryRewardPoints:    Number(f.entryRewardPoints),
            birthdayRewardPoints: Number(f.birthdayRewardPoints),
          }
        : t,
    );
    fetcher.submit({ intent: "save-tiers", tiers: JSON.stringify(updatedTiers) }, { method: "post" });
  };
  const submitToggleReward = (id: string, current: boolean) =>
    fetcher.submit({ intent: "toggle-reward", id, isActive: String(!current) }, { method: "post" });
  const submitDeleteReward = (id: string) =>
    fetcher.submit({ intent: "delete-reward", id }, { method: "post" });

  const totalPages = Math.ceil(memberTotal / memberPageSize);

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview",  label: "Overview" },
    { key: "members",   label: `Members (${memberTotal})` },
    { key: "rules",     label: "Earning rules" },
    { key: "rewards",   label: "Rewards" },
    { key: "tiers",     label: "Tiers" },
    { key: "referrals", label: "Referrals" },
    { key: "settings",  label: "Settings" },
  ];

  return (
    <s-page heading="Loyalty admin">
      {/* Tab bar */}
      <s-section>
        <div style={styles.tabBar}>
          {tabs.map((tab) => (
            <button key={tab.key} style={styles.tab(activeTab === tab.key)} onClick={() => setActiveTab(tab.key)}>
              {tab.label}
            </button>
          ))}
        </div>
      </s-section>

      {/* ── Overview ─────────────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <>
          <s-section heading="Program snapshot">
            <div style={styles.grid("repeat(auto-fit, minmax(200px, 1fr))")}>
              {[
                { label: "Total members",          value: overviewStats.totalMembers.toLocaleString() },
                { label: "Points issued (all time)", value: overviewStats.totalPointsIssued.toLocaleString() },
                { label: "Active rewards",          value: overviewStats.activeRewardsCount.toLocaleString() },
                { label: "Expiring in 30 days",     value: overviewStats.expiringIn30Days.toLocaleString() },
              ].map(({ label, value }) => (
                <div key={label} style={styles.card}>
                  <div style={{ ...styles.muted, marginBottom: "6px" }}>{label}</div>
                  <div style={{ fontSize: "28px", fontWeight: 700 }}>{value}</div>
                </div>
              ))}
            </div>
          </s-section>

          <s-section heading="Tier breakdown">
            <div style={styles.grid("repeat(auto-fit, minmax(220px, 1fr))")}>
              {shopConfig.tiers.map((tier) => {
                const { color, bg, border } = tc(tier.name);
                const count = tierCounts[tier.name] ?? 0;
                return (
                  <div key={tier.name} style={{ padding: "18px", borderRadius: "14px", background: bg, border: `1px solid ${border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "14px" }}>
                      <div>
                        <div style={{ fontSize: "20px", fontWeight: 700, color }}>{tier.displayName}</div>
                        <div style={styles.muted}>{tier.minPoints.toLocaleString()}+ pts</div>
                      </div>
                      <span style={{ background: "#fff", borderRadius: "999px", padding: "4px 10px", fontSize: "12px", fontWeight: 700 }}>
                        {tier.earnMultiplier}x
                      </span>
                    </div>
                    <div style={{ fontSize: "24px", fontWeight: 700 }}>{count.toLocaleString()}</div>
                    <div style={styles.muted}>Members</div>
                  </div>
                );
              })}
            </div>
          </s-section>

          <s-section heading="Readiness checklist">
            <s-stack direction="block" gap="base">
              {[
                "Confirm exact Ends with Benefits thresholds before migration cutover.",
                "Validate OTC and silent re-auth flows against Plus Multipass configuration.",
                "QA proactive redeemable-point prompts on PDP, cart, and account entry points.",
              ].map((item) => (
                <div key={item} style={{ padding: "12px 14px", border: "1px solid #e1e3e5", borderRadius: "10px", background: "#fff" }}>
                  <span style={{ fontWeight: 600, marginRight: "6px" }}>Check:</span>
                  <span style={styles.muted}>{item}</span>
                </div>
              ))}
            </s-stack>
          </s-section>
        </>
      )}

      {/* ── Members ──────────────────────────────────────────────────────── */}
      {activeTab === "members" && (
        <>
          <s-section heading="Search">
            <Form method="get" style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <s-text-field name="search" label="Search members" defaultValue={data.search} placeholder="Email or name" />
              </div>
              <s-button type="submit">Search</s-button>
              {data.search && (
                <s-button onClick={() => { window.location.href = window.location.pathname; }}>
                  Clear
                </s-button>
              )}
            </Form>
          </s-section>

          <s-section heading={`Members${data.search ? ` matching "${data.search}"` : ""}`}>
            {members.length === 0 ? (
              <div style={{ ...styles.muted, padding: "24px", textAlign: "center" }}>
                {data.search ? "No members found." : "No members yet — they'll appear here after their first order."}
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #d2d5d8" }}>
                      {["Customer", "Tier", "Balance", "Reviews", "Last activity", ""].map((h) => (
                        <th key={h} style={styles.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => {
                      const { color, bg } = tc(m.tier);
                      const lastActivity = m.lastActivityAt
                        ? new Date(m.lastActivityAt).toLocaleDateString()
                        : "—";
                      return (
                        <tr key={m.id} style={{ borderBottom: "1px solid #eceeef" }}>
                          <td style={styles.td}>
                            <div style={{ fontWeight: 600 }}>
                              {m.firstName || m.lastName ? `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim() : "—"}
                            </div>
                            <div style={styles.muted}>{m.email}</div>
                          </td>
                          <td style={styles.td}>
                            <span style={{ background: bg, color, borderRadius: "999px", padding: "3px 10px", fontSize: "12px", fontWeight: 600 }}>
                              {m.tier}
                            </span>
                            {m.expiringSoon && (
                              <span style={{ marginLeft: "6px", background: "#fff1d6", color: "#9a6700", borderRadius: "999px", padding: "3px 8px", fontSize: "11px" }}>
                                expiring
                              </span>
                            )}
                          </td>
                          <td style={{ ...styles.td, fontWeight: 700 }}>{m.pointsBalance.toLocaleString()}</td>
                          <td style={styles.td}>{m.reviewCount}</td>
                          <td style={{ ...styles.td, ...styles.muted }}>{lastActivity}</td>
                          <td style={styles.td}><s-button>View</s-button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {totalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px", ...styles.muted }}>
                <span>Page {memberPage} of {totalPages} ({memberTotal} members)</span>
                <div style={{ display: "flex", gap: "8px" }}>
                  {memberPage > 1 && (
                    <Form method="get"><input type="hidden" name="search" value={data.search} /><input type="hidden" name="page" value={memberPage - 1} /><s-button type="submit">Previous</s-button></Form>
                  )}
                  {memberPage < totalPages && (
                    <Form method="get"><input type="hidden" name="search" value={data.search} /><input type="hidden" name="page" value={memberPage + 1} /><s-button type="submit">Next</s-button></Form>
                  )}
                </div>
              </div>
            )}
          </s-section>
        </>
      )}

      {/* ── Earning rules ────────────────────────────────────────────────── */}
      {activeTab === "rules" && (
        <s-section heading="Earning rules">
          <fetcher.Form method="post">
            <input type="hidden" name="intent"              value="save-rules" />
            <input type="hidden" name="purchaseEnabled"     value={String(shopConfig.earningRules.purchaseEnabled)} />
            <input type="hidden" name="textReviewEnabled"   value={String(shopConfig.earningRules.textReviewEnabled)} />
            <input type="hidden" name="videoReviewEnabled"  value={String(shopConfig.earningRules.videoReviewEnabled)} />
            <s-stack direction="block" gap="base">

              {/* ── Purchases ── */}
              <div style={{ fontWeight: 700, fontSize: "13px", color: "#5c5f62", textTransform: "uppercase", letterSpacing: ".04em", marginTop: "4px" }}>Purchases</div>
              {[
                { label: "Purchase points", desc: "Per $1 spent before tier multiplier. Applied on orders/paid webhook.", name: "basePointsPerDollar", val: shopConfig.earningRules.basePointsPerDollar, unit: "pts / $1" },
              ].map((r) => (
                <div key={r.name} style={styles.card}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: "16px", alignItems: "center" }}>
                    <div><div style={{ fontWeight: 600, marginBottom: "4px" }}>{r.label}</div><div style={styles.muted}>{r.desc}</div></div>
                    <s-text-field label={r.unit} name={r.name} value={String(r.val)} />
                  </div>
                </div>
              ))}

              {/* ── Reviews ── */}
              <div style={{ fontWeight: 700, fontSize: "13px", color: "#5c5f62", textTransform: "uppercase", letterSpacing: ".04em", marginTop: "8px" }}>Reviews</div>
              {[
                { label: "Text review",  desc: "Approved written review (no media).",         name: "textReviewPoints",  val: shopConfig.earningRules.textReviewPoints },
                { label: "Photo review", desc: "Approved review with at least one photo.",     name: "photoReviewPoints", val: shopConfig.earningRules.photoReviewPoints },
                { label: "Video review", desc: "Approved review with video.",                  name: "videoReviewPoints", val: shopConfig.earningRules.videoReviewPoints },
              ].map((r) => (
                <div key={r.name} style={styles.card}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: "16px", alignItems: "center" }}>
                    <div><div style={{ fontWeight: 600, marginBottom: "4px" }}>{r.label}</div><div style={styles.muted}>{r.desc}</div></div>
                    <s-text-field label="Points" name={r.name} value={String(r.val)} />
                  </div>
                </div>
              ))}

              {/* ── Social / account ── */}
              <div style={{ fontWeight: 700, fontSize: "13px", color: "#5c5f62", textTransform: "uppercase", letterSpacing: ".04em", marginTop: "8px" }}>Social &amp; account (one-time)</div>
              {[
                { label: "Create account",    desc: "Awarded once on first account registration.",    name: "createAccountPoints",   val: shopConfig.earningRules.createAccountPoints },
                { label: "SMS signup",         desc: "Awarded once for SMS/Attentive opt-in.",         name: "smsSignupPoints",       val: shopConfig.earningRules.smsSignupPoints },
                { label: "Facebook share",    desc: "Share a product on Facebook.",                   name: "facebookSharePoints",   val: shopConfig.earningRules.facebookSharePoints },
                { label: "Facebook group",    desc: "Join the Doomlings Facebook group.",             name: "facebookGroupPoints",   val: shopConfig.earningRules.facebookGroupPoints },
                { label: "Instagram follow",  desc: "Follow Doomlings on Instagram.",                 name: "instagramFollowPoints", val: shopConfig.earningRules.instagramFollowPoints },
                { label: "TikTok follow",     desc: "Follow Doomlings on TikTok.",                    name: "tiktokFollowPoints",    val: shopConfig.earningRules.tiktokFollowPoints },
                { label: "Discord join",      desc: "Join the Doomlings Discord server.",             name: "discordJoinPoints",     val: shopConfig.earningRules.discordJoinPoints },
                { label: "Twitch follow",     desc: "Follow Doomlings on Twitch.",                    name: "twitchFollowPoints",    val: shopConfig.earningRules.twitchFollowPoints },
              ].map((r) => (
                <div key={r.name} style={styles.card}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: "16px", alignItems: "center" }}>
                    <div><div style={{ fontWeight: 600, marginBottom: "4px" }}>{r.label}</div><div style={styles.muted}>{r.desc}</div></div>
                    <s-text-field label="Points" name={r.name} value={String(r.val)} />
                  </div>
                </div>
              ))}

              {/* ── Recurring ── */}
              <div style={{ fontWeight: 700, fontSize: "13px", color: "#5c5f62", textTransform: "uppercase", letterSpacing: ".04em", marginTop: "8px" }}>Recurring</div>
              {[
                { label: "Birthday reward",  desc: "Awarded once per year on the customer's birthday.", name: "birthdayPoints",  val: shopConfig.earningRules.birthdayPoints },
                { label: "Referral reward",  desc: "Awarded to referring customer per successful referral.", name: "referralPoints", val: shopConfig.earningRules.referralPoints },
              ].map((r) => (
                <div key={r.name} style={styles.card}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: "16px", alignItems: "center" }}>
                    <div><div style={{ fontWeight: 600, marginBottom: "4px" }}>{r.label}</div><div style={styles.muted}>{r.desc}</div></div>
                    <s-text-field label="Points" name={r.name} value={String(r.val)} />
                  </div>
                </div>
              ))}

              <div>
                <s-button variant="primary" type="submit" disabled={submitting}>
                  {submitting ? "Saving…" : "Save earning rules"}
                </s-button>
              </div>
            </s-stack>
          </fetcher.Form>
        </s-section>
      )}

      {/* ── Rewards ──────────────────────────────────────────────────────── */}
      {activeTab === "rewards" && (
        <>
          <s-section heading="Reward catalog">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={styles.muted}>Manage redeemable rewards available to loyalty members.</div>
              {rewardMode === "none" && <s-button variant="primary" onClick={openAddReward}>Add reward</s-button>}
            </div>
          </s-section>

          {/* Add / Edit form */}
          {rewardMode !== "none" && (
            <s-section heading={rewardMode === "add" ? "New reward" : "Edit reward"}>
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value={rewardMode === "add" ? "create-reward" : "update-reward"} />
                {rewardMode !== "add" && <input type="hidden" name="id" value={rewardMode} />}
                <s-stack direction="block" gap="base">
                  <div style={styles.grid("repeat(2, minmax(0,1fr))")}>
                    <s-text-field label="Name" name="name" value={rewardForm.name}
                      onInput={(e: any) => setRewardForm((f) => ({ ...f, name: e.target.value }))} />
                    <s-text-field label="Points cost" name="pointsCost" value={rewardForm.pointsCost}
                      onInput={(e: any) => setRewardForm((f) => ({ ...f, pointsCost: e.target.value }))} />
                  </div>
                  <div style={styles.grid("repeat(2, minmax(0,1fr))")}>
                    <s-select label="Type" name="type" value={rewardForm.type}
                      onChange={(e: any) => setRewardForm((f) => ({ ...f, type: e.target.value }))}>
                      {REWARD_TYPES.map((t) => <s-option key={t.value} value={t.value}>{t.label}</s-option>)}
                    </s-select>
                    <s-text-field label="Value (e.g. 10 for 10%)" name="value" value={rewardForm.value}
                      onInput={(e: any) => setRewardForm((f) => ({ ...f, value: e.target.value }))} />
                  </div>
                  <s-text-field label="Description (optional)" name="description" value={rewardForm.description}
                    onInput={(e: any) => setRewardForm((f) => ({ ...f, description: e.target.value }))} />
                  <div style={{ display: "flex", gap: "8px" }}>
                    <s-button variant="primary" type="submit" disabled={submitting}>
                      {submitting ? "Saving…" : "Save reward"}
                    </s-button>
                    <s-button type="button" onClick={() => setRewardMode("none")}>Cancel</s-button>
                  </div>
                </s-stack>
              </fetcher.Form>
            </s-section>
          )}

          <s-section heading={`Rewards (${rewards.length})`}>
            {rewards.length === 0 ? (
              <div style={{ ...styles.muted, padding: "24px", textAlign: "center" }}>No rewards yet.</div>
            ) : (
              <s-stack direction="block" gap="base">
                {rewards.map((reward) => (
                  <div key={reward.id} style={{ ...styles.card, opacity: reward.isActive ? 1 : 0.6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                      <div>
                        <div style={{ fontWeight: 600, marginBottom: "4px" }}>{reward.name}</div>
                        <div style={styles.muted}>
                          {REWARD_TYPES.find((t) => t.value === reward.type)?.label ?? reward.type}
                          {" — value: "}{reward.value}
                          {reward.description ? ` — ${reward.description}` : ""}
                        </div>
                      </div>
                      <span style={styles.pill(reward.isActive)}>{reward.isActive ? "Active" : "Inactive"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontSize: "22px", fontWeight: 700 }}>{reward.pointsCost.toLocaleString()} pts</div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <s-button onClick={() => submitToggleReward(reward.id, reward.isActive)} disabled={submitting}>
                          {reward.isActive ? "Disable" : "Enable"}
                        </s-button>
                        <s-button onClick={() => openEditReward(reward)}>Edit</s-button>
                        <s-button onClick={() => { if (confirm("Delete this reward?")) submitDeleteReward(reward.id); }} disabled={submitting}>
                          Delete
                        </s-button>
                      </div>
                    </div>
                  </div>
                ))}
              </s-stack>
            )}
          </s-section>
        </>
      )}

      {/* ── Tiers ────────────────────────────────────────────────────────── */}
      {activeTab === "tiers" && (
        <s-section heading="Tier configuration">
          <div style={{ ...styles.muted, marginBottom: "16px" }}>
            Placeholder values — update with confirmed Ends with Benefits thresholds from Eric before launch.
          </div>
          <s-stack direction="block" gap="base">
            {shopConfig.tiers.map((tier) => {
              const { color, bg, border } = tc(tier.name);
              const isEditing = editingTier === tier.name;
              const f = tierForms[tier.name];
              return (
                <div key={tier.name} style={{ borderRadius: "14px", border: `1px solid ${border}`, background: bg, padding: "18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                    <div>
                      <div style={{ fontSize: "20px", fontWeight: 700, color }}>{tier.displayName}</div>
                      <div style={styles.muted}>
                        {tier.minPoints.toLocaleString()}+ pts · {tier.earnMultiplier}x multiplier · {(tierCounts[tier.name] ?? 0).toLocaleString()} members
                      </div>
                    </div>
                    {!isEditing && <s-button onClick={() => openEditTier(tier)}>Edit tier</s-button>}
                  </div>

                  {isEditing && f && (
                    <div style={{ marginTop: "12px", padding: "14px", background: "rgba(255,255,255,0.7)", borderRadius: "10px" }}>
                      <div style={{ ...styles.grid("repeat(3, minmax(0,1fr))"), marginBottom: "12px" }}>
                        <s-text-field label="Display name" value={f.displayName}
                          onInput={(e: any) => setTierForms((prev) => ({ ...prev, [tier.name]: { ...prev[tier.name], displayName: e.target.value } }))} />
                        <s-text-field label="Min points threshold" value={f.minPoints}
                          onInput={(e: any) => setTierForms((prev) => ({ ...prev, [tier.name]: { ...prev[tier.name], minPoints: e.target.value } }))} />
                        <s-text-field label="Earn multiplier" value={f.earnMultiplier}
                          onInput={(e: any) => setTierForms((prev) => ({ ...prev, [tier.name]: { ...prev[tier.name], earnMultiplier: e.target.value } }))} />
                      </div>
                      <div style={styles.grid("repeat(2, minmax(0,1fr))")}>
                        <s-text-field label="Entry reward (points)" value={f.entryRewardPoints}
                          onInput={(e: any) => setTierForms((prev) => ({ ...prev, [tier.name]: { ...prev[tier.name], entryRewardPoints: e.target.value } }))} />
                        <s-text-field label="Birthday reward (points)" value={f.birthdayRewardPoints}
                          onInput={(e: any) => setTierForms((prev) => ({ ...prev, [tier.name]: { ...prev[tier.name], birthdayRewardPoints: e.target.value } }))} />
                      </div>
                      <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                        <s-button variant="primary" onClick={() => saveTier(tier.name)} disabled={submitting}>
                          {submitting ? "Saving…" : "Save tier"}
                        </s-button>
                        <s-button onClick={() => setEditingTier(null)}>Cancel</s-button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </s-stack>
        </s-section>
      )}

      {/* ── Referrals (static — not yet implemented) ─────────────────────── */}
      {activeTab === "referrals" && (
        <s-section heading="Referrals">
          <s-banner heading="Coming soon" tone="info">
            Referral tracking is not yet implemented. Configure referral rewards here once the feature is built.
          </s-banner>
        </s-section>
      )}

      {/* ── Settings ─────────────────────────────────────────────────────── */}
      {activeTab === "settings" && (
        <>
          <s-section heading="Program settings">
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="save-settings" />
              <input type="hidden" name="launcherPromptsEnabled" value={String(settingsForm.launcherPromptsEnabled)} />
              <s-stack direction="block" gap="base">
                <s-text-field
                  label="Points currency name"
                  name="pointsCurrencyName"
                  value={settingsForm.pointsCurrencyName}
                  onInput={(e: any) => setSettingsForm((f) => ({ ...f, pointsCurrencyName: e.target.value }))}
                  details="Use the same label already shown in the live program."
                />
                <div style={styles.grid("repeat(2, minmax(0,1fr))")}>
                  <s-text-field
                    label="Points expiry window (months)"
                    name="expiryMonths"
                    value={settingsForm.expiryMonths}
                    onInput={(e: any) => setSettingsForm((f) => ({ ...f, expiryMonths: e.target.value }))}
                  />
                  <s-text-field
                    label="Expiry warning lead time (days)"
                    name="expiryWarningDays"
                    value={settingsForm.expiryWarningDays}
                    onInput={(e: any) => setSettingsForm((f) => ({ ...f, expiryWarningDays: e.target.value }))}
                  />
                </div>
              </s-stack>

              <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid #e1e3e5" }}>
                <div style={{ fontWeight: 600, marginBottom: "12px" }}>Accounts layer</div>
                <s-stack direction="block" gap="base">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", padding: "12px 0" }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>Enable proactive launcher prompts</div>
                      <div style={styles.muted}>Surface redeemable point nudges once per session.</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settingsForm.launcherPromptsEnabled}
                      onChange={(e) => setSettingsForm((f) => ({ ...f, launcherPromptsEnabled: e.target.checked }))}
                      style={{ width: "18px", height: "18px" }}
                    />
                  </div>
                  <s-text-field
                    label="Silent re-auth session length (days)"
                    name="silentReauthDays"
                    value={settingsForm.silentReauthDays}
                    onInput={(e: any) => setSettingsForm((f) => ({ ...f, silentReauthDays: e.target.value }))}
                    details="Recommended 30 days, with OTC fallback on unrecognized IP."
                  />
                </s-stack>
              </div>

              <div style={{ marginTop: "16px" }}>
                <s-button variant="primary" type="submit" disabled={submitting}>
                  {submitting ? "Saving…" : "Save settings"}
                </s-button>
              </div>
            </fetcher.Form>
          </s-section>
        </>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
