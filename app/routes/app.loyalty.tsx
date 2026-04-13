import { useState } from "react";
import type { CSSProperties } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return {};
};

type Tab =
  | "overview"
  | "members"
  | "rules"
  | "rewards"
  | "tiers"
  | "referrals"
  | "settings";

const tierCards = [
  {
    name: "Bronze",
    threshold: "0-499 points",
    multiplier: "1x",
    members: 8421,
    spend: "$58k",
    color: "#b65b30",
    background: "#fff4ee",
  },
  {
    name: "Silver",
    threshold: "500-1,499 points",
    multiplier: "1.5x",
    members: 6420,
    spend: "$94k",
    color: "#576f86",
    background: "#f3f6f8",
  },
  {
    name: "Gold",
    threshold: "1,500+ points",
    multiplier: "2x",
    members: 3579,
    spend: "$127k",
    color: "#aa7600",
    background: "#fff8e1",
  },
];

const members = [
  {
    name: "Sarah Mitchell",
    email: "s.mitchell@email.com",
    tier: "Gold",
    balance: 2480,
    lifetimeSpend: "$1,940",
    reviewedOrders: 5,
    lastSeen: "Today",
    status: "Authenticated",
  },
  {
    name: "James Rodriguez",
    email: "j.rod@email.com",
    tier: "Gold",
    balance: 1840,
    lifetimeSpend: "$1,210",
    reviewedOrders: 4,
    lastSeen: "Today",
    status: "Redeemable",
  },
  {
    name: "Emma Wilson",
    email: "emma.w@email.com",
    tier: "Silver",
    balance: 920,
    lifetimeSpend: "$684",
    reviewedOrders: 3,
    lastSeen: "Yesterday",
    status: "Pending expiry",
  },
  {
    name: "Mike Torres",
    email: "mike.t@email.com",
    tier: "Silver",
    balance: 610,
    lifetimeSpend: "$452",
    reviewedOrders: 2,
    lastSeen: "2 days ago",
    status: "Authenticated",
  },
  {
    name: "Amy Chen",
    email: "amy.c@email.com",
    tier: "Bronze",
    balance: 110,
    lifetimeSpend: "$86",
    reviewedOrders: 1,
    lastSeen: "5 days ago",
    status: "Needs OTC",
  },
];

const earningRulesSeed = [
  {
    id: 1,
    action: "Purchase points",
    description: "Base points granted per dollar spent before tier multipliers.",
    points: "1 pt / $1",
    enabled: true,
    source: "Shopify order paid webhook",
  },
  {
    id: 2,
    action: "Text review",
    description: "Awarded after a verified written review is approved.",
    points: "75 pts",
    enabled: true,
    source: "Approved review",
  },
  {
    id: 3,
    action: "Video review bonus",
    description: "Additional reward for approved short-form video review uploads.",
    points: "+50 pts",
    enabled: true,
    source: "Approved review video",
  },
  {
    id: 4,
    action: "Referral purchase",
    description: "Given to the referring customer after first successful order.",
    points: "200 pts",
    enabled: true,
    source: "Referral conversion event",
  },
  {
    id: 5,
    action: "Birthday reward",
    description: "Optional annual reward granted once during birthday month.",
    points: "100 pts",
    enabled: false,
    source: "Scheduled job",
  },
];

const rewardsSeed = [
  {
    id: 1,
    name: "$5 off order",
    type: "Discount code",
    cost: 500,
    tier: "Any",
    inventory: "Unlimited",
    active: true,
  },
  {
    id: 2,
    name: "$10 off order",
    type: "Discount code",
    cost: 1000,
    tier: "Silver+",
    inventory: "Unlimited",
    active: true,
  },
  {
    id: 3,
    name: "Free shipping",
    type: "Shipping reward",
    cost: 350,
    tier: "Any",
    inventory: "Unlimited",
    active: true,
  },
  {
    id: 4,
    name: "Exclusive promo pack",
    type: "Product reward",
    cost: 1500,
    tier: "Gold",
    inventory: "42 left",
    active: false,
  },
];

const referrals = [
  { customer: "Sarah Mitchell", sent: 8, converted: 4, points: 800 },
  { customer: "James Rodriguez", sent: 5, converted: 3, points: 600 },
  { customer: "Emma Wilson", sent: 3, converted: 1, points: 200 },
];

const statusPill: Record<string, { background: string; color: string }> = {
  Authenticated: { background: "#dff7e5", color: "#0a7d45" },
  Redeemable: { background: "#e8f2ff", color: "#005bd3" },
  "Pending expiry": { background: "#fff1d6", color: "#9a6700" },
  "Needs OTC": { background: "#fde8e8", color: "#b42318" },
};

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
  cardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "12px",
  } satisfies CSSProperties,
  metricCard: {
    padding: "16px",
    border: "1px solid #e1e3e5",
    borderRadius: "12px",
    background: "#fff",
  } satisfies CSSProperties,
};

export default function Loyalty() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [rules, setRules] = useState(earningRulesSeed);
  const [rewards, setRewards] = useState(rewardsSeed);
  const [pointsName, setPointsName] = useState("Doom Points");
  const [expiryMonths, setExpiryMonths] = useState("12");
  const [warningDays, setWarningDays] = useState("30");
  const [referrerReward, setReferrerReward] = useState("200");
  const [refereeReward, setRefereeReward] = useState("100");
  const [launcherPrompt, setLauncherPrompt] = useState(true);
  const [silentReauthDays, setSilentReauthDays] = useState("30");

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "members", label: `Members (${members.length})` },
    { key: "rules", label: "Earning rules" },
    { key: "rewards", label: "Rewards" },
    { key: "tiers", label: "Tiers" },
    { key: "referrals", label: "Referrals" },
    { key: "settings", label: "Settings" },
  ];

  const toggleRule = (id: number) =>
    setRules((current) =>
      current.map((rule) =>
        rule.id === id ? { ...rule, enabled: !rule.enabled } : rule,
      ),
    );

  const toggleReward = (id: number) =>
    setRewards((current) =>
      current.map((reward) =>
        reward.id === id ? { ...reward, active: !reward.active } : reward,
      ),
    );

  return (
    <s-page heading="Loyalty admin">
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
          <s-section heading="Program snapshot">
            <div style={styles.cardGrid}>
              <div style={styles.metricCard}>
                <div style={{ fontSize: "12px", color: "#5c5f62", marginBottom: "6px" }}>
                  Total points issued
                </div>
                <div style={{ fontSize: "28px", fontWeight: 700 }}>12.4M</div>
                <div style={{ fontSize: "13px", color: "#5c5f62", marginTop: "6px" }}>
                  Includes migrated balances from Yotpo and live earn events.
                </div>
              </div>
              <div style={styles.metricCard}>
                <div style={{ fontSize: "12px", color: "#5c5f62", marginBottom: "6px" }}>
                  Redeemed this month
                </div>
                <div style={{ fontSize: "28px", fontWeight: 700 }}>1,284</div>
                <div style={{ fontSize: "13px", color: "#5c5f62", marginTop: "6px" }}>
                  41% from customers returning through the persistent account layer.
                </div>
              </div>
              <div style={styles.metricCard}>
                <div style={{ fontSize: "12px", color: "#5c5f62", marginBottom: "6px" }}>
                  Points expiring in 30 days
                </div>
                <div style={{ fontSize: "28px", fontWeight: 700 }}>82,450</div>
                <div style={{ fontSize: "13px", color: "#5c5f62", marginTop: "6px" }}>
                  Review member-facing warning placements before bulk expiration runs.
                </div>
              </div>
              <div style={styles.metricCard}>
                <div style={{ fontSize: "12px", color: "#5c5f62", marginBottom: "6px" }}>
                  Silent re-auth success
                </div>
                <div style={{ fontSize: "28px", fontWeight: 700 }}>73%</div>
                <div style={{ fontSize: "13px", color: "#5c5f62", marginTop: "6px" }}>
                  Remaining sessions fall back to one-time code verification.
                </div>
              </div>
            </div>
          </s-section>

          <s-section heading="Tier parity">
            <div style={styles.cardGrid}>
              {tierCards.map((tier) => (
                <div
                  key={tier.name}
                  style={{
                    padding: "18px",
                    borderRadius: "14px",
                    background: tier.background,
                    border: `1px solid ${tier.color}33`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: "14px",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "20px", fontWeight: 700, color: tier.color }}>
                        {tier.name}
                      </div>
                      <div style={{ fontSize: "12px", color: "#5c5f62" }}>{tier.threshold}</div>
                    </div>
                    <span
                      style={{
                        background: "#fff",
                        borderRadius: "999px",
                        padding: "4px 10px",
                        fontSize: "12px",
                        fontWeight: 700,
                      }}
                    >
                      {tier.multiplier}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                    <div>
                      <div style={{ fontSize: "24px", fontWeight: 700 }}>{tier.members}</div>
                      <div style={{ fontSize: "12px", color: "#5c5f62" }}>Members</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "24px", fontWeight: 700 }}>{tier.spend}</div>
                      <div style={{ fontSize: "12px", color: "#5c5f62" }}>30d spend</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </s-section>

          <s-section heading="Readiness checklist">
            <s-stack direction="block" gap="base">
              {[
                "Confirm exact Ends with Benefits thresholds before migration cutover.",
                "Validate OTC and silent re-auth flows against Plus Multipass configuration.",
                "QA proactive redeemable-point prompts on PDP, cart, and account entry points.",
              ].map((item) => (
                <div
                  key={item}
                  style={{
                    padding: "12px 14px",
                    border: "1px solid #e1e3e5",
                    borderRadius: "10px",
                    background: "#fff",
                  }}
                >
                  <span style={{ fontWeight: 600, marginRight: "6px" }}>Check:</span>
                  <span style={{ color: "#5c5f62" }}>{item}</span>
                </div>
              ))}
            </s-stack>
          </s-section>
        </>
      )}

      {activeTab === "members" && (
        <>
          <s-section heading="Member controls">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1.8fr) minmax(260px, 1fr)",
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
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px" }}>
                  <s-text-field label="Search members" value="" placeholder="Name, email, customer ID" />
                  <s-select label="Tier">
                    <s-option value="all">All tiers</s-option>
                    <s-option value="bronze">Bronze</s-option>
                    <s-option value="silver">Silver</s-option>
                    <s-option value="gold">Gold</s-option>
                  </s-select>
                  <s-select label="Status">
                    <s-option value="all">All statuses</s-option>
                    <s-option value="redeemable">Redeemable</s-option>
                    <s-option value="otc">Needs OTC</s-option>
                    <s-option value="expiry">Pending expiry</s-option>
                  </s-select>
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
                <div style={{ fontWeight: 600, marginBottom: "6px" }}>Operator shortcuts</div>
                <div style={{ fontSize: "13px", color: "#5c5f62", marginBottom: "12px" }}>
                  Use these controls when validating migration balances and customer sessions.
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  <s-button variant="primary">Adjust balance</s-button>
                  <s-button>View ledger</s-button>
                  <s-button>Force OTC</s-button>
                </div>
              </div>
            </div>
          </s-section>

          <s-section heading="Members">
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #d2d5d8" }}>
                    {[
                      "Customer",
                      "Tier",
                      "Balance",
                      "Lifetime spend",
                      "Reviewed orders",
                      "Last seen",
                      "Status",
                      "",
                    ].map((header) => (
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
                  {members.map((member) => (
                    <tr key={member.email} style={{ borderBottom: "1px solid #eceeef" }}>
                      <td style={{ padding: "12px" }}>
                        <div style={{ fontWeight: 600 }}>{member.name}</div>
                        <div style={{ fontSize: "12px", color: "#5c5f62" }}>{member.email}</div>
                      </td>
                      <td style={{ padding: "12px" }}>{member.tier}</td>
                      <td style={{ padding: "12px", fontWeight: 700 }}>
                        {member.balance.toLocaleString()}
                      </td>
                      <td style={{ padding: "12px" }}>{member.lifetimeSpend}</td>
                      <td style={{ padding: "12px" }}>{member.reviewedOrders}</td>
                      <td style={{ padding: "12px", color: "#5c5f62" }}>{member.lastSeen}</td>
                      <td style={{ padding: "12px" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            padding: "3px 10px",
                            borderRadius: "999px",
                            background: statusPill[member.status].background,
                            color: statusPill[member.status].color,
                            fontSize: "12px",
                            fontWeight: 600,
                          }}
                        >
                          {member.status}
                        </span>
                      </td>
                      <td style={{ padding: "12px" }}>
                        <s-button>View</s-button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </s-section>
        </>
      )}

      {activeTab === "rules" && (
        <s-section heading="Earning rules">
          <s-stack direction="block" gap="base">
            {rules.map((rule) => (
              <div
                key={rule.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1.7fr) minmax(120px, auto) minmax(220px, auto)",
                  gap: "16px",
                  alignItems: "center",
                  padding: "16px",
                  border: "1px solid #e1e3e5",
                  borderRadius: "12px",
                  background: "#fff",
                  opacity: rule.enabled ? 1 : 0.65,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, marginBottom: "4px" }}>{rule.action}</div>
                  <div style={{ fontSize: "13px", color: "#5c5f62", marginBottom: "4px" }}>
                    {rule.description}
                  </div>
                  <div style={{ fontSize: "12px", color: "#5c5f62" }}>Source: {rule.source}</div>
                </div>
                <div>
                  <div style={{ fontSize: "12px", color: "#5c5f62", marginBottom: "4px" }}>
                    Value
                  </div>
                  <div style={{ fontWeight: 700 }}>{rule.points}</div>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", flexWrap: "wrap" }}>
                  <s-button onClick={() => toggleRule(rule.id)}>
                    {rule.enabled ? "Disable" : "Enable"}
                  </s-button>
                  <s-button variant="primary">Edit rule</s-button>
                </div>
              </div>
            ))}
          </s-stack>
        </s-section>
      )}

      {activeTab === "rewards" && (
        <>
          <s-section heading="Reward catalog">
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <div style={{ fontSize: "13px", color: "#5c5f62", maxWidth: "720px" }}>
                Rewards must stay aligned to the current program during migration. Use
                this screen to manage costs, tier eligibility, and active storefront
                availability.
              </div>
              <s-button variant="primary">Add reward</s-button>
            </div>
          </s-section>

          <s-section heading="Active rewards">
            <s-stack direction="block" gap="base">
              {rewards.map((reward) => (
                <div
                  key={reward.id}
                  style={{
                    border: "1px solid #e1e3e5",
                    borderRadius: "12px",
                    padding: "16px",
                    background: "#fff",
                    opacity: reward.active ? 1 : 0.65,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: "12px",
                      marginBottom: "10px",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: "4px" }}>{reward.name}</div>
                      <div style={{ fontSize: "13px", color: "#5c5f62" }}>
                        {reward.type} - Minimum tier: {reward.tier} - Inventory: {reward.inventory}
                      </div>
                    </div>
                    <span
                      style={{
                        background: reward.active ? "#dff7e5" : "#eceeef",
                        color: reward.active ? "#0a7d45" : "#5c5f62",
                        borderRadius: "999px",
                        padding: "4px 10px",
                        fontSize: "12px",
                        fontWeight: 600,
                      }}
                    >
                      {reward.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "12px",
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ fontSize: "22px", fontWeight: 700 }}>
                      {reward.cost.toLocaleString()} points
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <s-button onClick={() => toggleReward(reward.id)}>
                        {reward.active ? "Disable" : "Enable"}
                      </s-button>
                      <s-button variant="primary">Edit reward</s-button>
                    </div>
                  </div>
                </div>
              ))}
            </s-stack>
          </s-section>
        </>
      )}

      {activeTab === "tiers" && (
        <s-section heading="Tier configuration">
          <s-stack direction="block" gap="base">
            {tierCards.map((tier) => (
              <div
                key={tier.name}
                style={{
                  borderRadius: "14px",
                  border: `1px solid ${tier.color}33`,
                  background: tier.background,
                  padding: "18px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "16px",
                    marginBottom: "12px",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "20px", fontWeight: 700, color: tier.color }}>
                      {tier.name}
                    </div>
                    <div style={{ fontSize: "13px", color: "#5c5f62" }}>
                      Threshold: {tier.threshold}
                    </div>
                  </div>
                  <s-button>Edit tier</s-button>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                    gap: "12px",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "12px", color: "#5c5f62" }}>Multiplier</div>
                    <div style={{ fontWeight: 700, fontSize: "18px" }}>{tier.multiplier}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "12px", color: "#5c5f62" }}>Members</div>
                    <div style={{ fontWeight: 700, fontSize: "18px" }}>
                      {tier.members.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "12px", color: "#5c5f62" }}>30d spend</div>
                    <div style={{ fontWeight: 700, fontSize: "18px" }}>{tier.spend}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "12px", color: "#5c5f62" }}>Migration parity</div>
                    <div style={{ fontWeight: 700, fontSize: "18px" }}>Awaiting final export</div>
                  </div>
                </div>
              </div>
            ))}
          </s-stack>
        </s-section>
      )}

      {activeTab === "referrals" && (
        <>
          <s-section heading="Referral rules">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
              <s-text-field
                label="Referrer reward"
                value={referrerReward}
                onInput={(event: any) => setReferrerReward(event.target.value)}
              />
              <s-text-field
                label="New customer reward"
                value={refereeReward}
                onInput={(event: any) => setRefereeReward(event.target.value)}
              />
            </div>
          </s-section>

          <s-section heading="Top referral members">
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #d2d5d8" }}>
                    {["Customer", "Links sent", "Conversions", "Points earned"].map((header) => (
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
                  {referrals.map((row) => (
                    <tr key={row.customer} style={{ borderBottom: "1px solid #eceeef" }}>
                      <td style={{ padding: "12px", fontWeight: 600 }}>{row.customer}</td>
                      <td style={{ padding: "12px" }}>{row.sent}</td>
                      <td style={{ padding: "12px" }}>{row.converted}</td>
                      <td style={{ padding: "12px" }}>{row.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </s-section>
        </>
      )}

      {activeTab === "settings" && (
        <>
          <s-section heading="Program settings">
            <s-stack direction="block" gap="base">
              <s-text-field
                label="Points currency name"
                value={pointsName}
                onInput={(event: any) => setPointsName(event.target.value)}
                details="Use the same currency label already shown in the live program."
              />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
                <s-text-field
                  label="Points expiry window (months)"
                  value={expiryMonths}
                  onInput={(event: any) => setExpiryMonths(event.target.value)}
                />
                <s-text-field
                  label="Expiry warning lead time (days)"
                  value={warningDays}
                  onInput={(event: any) => setWarningDays(event.target.value)}
                />
              </div>
            </s-stack>
          </s-section>

          <s-section heading="Accounts layer">
            <s-stack direction="block" gap="base">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "16px",
                  padding: "12px 0",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>Enable proactive launcher prompts</div>
                  <div style={{ fontSize: "13px", color: "#5c5f62" }}>
                    Surface redeemable point nudges once per session for authenticated customers.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={launcherPrompt}
                  onChange={(event) => setLauncherPrompt(event.target.checked)}
                  style={{ width: "18px", height: "18px" }}
                />
              </div>
              <s-text-field
                label="Silent re-auth session length (days)"
                value={silentReauthDays}
                onInput={(event: any) => setSilentReauthDays(event.target.value)}
                details="Recommended default is 30 days, with OTC fallback on unrecognized IP."
              />
            </s-stack>
          </s-section>

          <s-section>
            <s-button variant="primary">Save loyalty settings</s-button>
          </s-section>
        </>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
