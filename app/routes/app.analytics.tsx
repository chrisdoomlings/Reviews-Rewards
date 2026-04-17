import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";

import { authenticate } from "../shopify.server";
import { getAnalytics } from "../reviews.server";

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url  = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") ?? "30") || 30;
  const type = url.searchParams.get("type") ?? "all";

  const data = await getAnalytics(session.shop, { days, type });
  return { ...data, days, type };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString();
}

function pctChange(pct: number) {
  const up    = pct >= 0;
  const color = up ? "#15803d" : "#b91c1c";
  return (
    <span style={{ fontSize: "12px", fontWeight: 600, color }}>
      {up ? "▲" : "▼"} {Math.abs(pct)}%
    </span>
  );
}

function starLabel(n: number) {
  return "★".repeat(n) + "☆".repeat(5 - n);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({
  label, value, sub, subEl,
}: {
  label: string;
  value: string;
  sub?: string;
  subEl?: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: "12px",
        padding: "18px 20px",
        flex: "1 1 180px",
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: "12px", color: "#6b7280", fontWeight: 600, marginBottom: "6px" }}>
        {label}
      </div>
      <div style={{ fontSize: "28px", fontWeight: 800, color: "#111827", marginBottom: "4px" }}>
        {value}
      </div>
      {sub   && <div style={{ fontSize: "12px", color: "#6b7280" }}>{sub}</div>}
      {subEl}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

const PERIOD_OPTIONS = [
  { label: "7 days",   value: 7 },
  { label: "30 days",  value: 30 },
  { label: "90 days",  value: 90 },
  { label: "12 months", value: 365 },
];

const TYPE_OPTIONS = [
  { label: "All",     value: "all" },
  { label: "Product", value: "product" },
  { label: "Site",    value: "site" },
];

const STATUS_COLORS: Record<string, string> = {
  approved: "#15803d",
  pending:  "#c2410c",
  rejected: "#6b7280",
  flagged:  "#b91c1c",
};

const STATUS_LABELS: Record<string, string> = {
  approved: "Published",
  pending:  "Pending",
  rejected: "Rejected",
  flagged:  "Flagged",
};

export default function Analytics() {
  const data           = useLoaderData<typeof loader>();
  const navigate       = useNavigate();
  const [params]       = useSearchParams();
  const { days, type } = data;

  function nav(updates: Record<string, string | number>) {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(updates)) p.set(k, String(v));
    navigate(`?${p.toString()}`);
  }

  // ── Derived data ────────────────────────────────────────────────────────────

  const totalRatings = Object.values(data.ratingDist).reduce((a, b) => a + b, 0) || 1;
  const ratingBars   = [5, 4, 3, 2, 1].map((n) => ({
    stars: n,
    count: data.ratingDist[n] ?? 0,
    pct:   totalRatings ? Math.round(((data.ratingDist[n] ?? 0) / totalRatings) * 100) : 0,
  }));

  const statusPie = Object.entries(data.statusDist)
    .filter(([, v]) => v > 0)
    .map(([key, value]) => ({
      name:  STATUS_LABELS[key] ?? key,
      value,
      color: STATUS_COLORS[key] ?? "#9ca3af",
    }));

  // Fill in missing days in the time series so the chart has a bar per day
  const chartData = (() => {
    const map = new Map(data.timeSeries.map((r) => [r.day, r.count]));
    const result: { day: string; count: number; label: string }[] = [];
    const msPerDay = 24 * 60 * 60 * 1000;
    const totalDays = Math.min(days, 365);
    const step = totalDays > 90 ? 7 : 1; // weekly for 90d+
    for (let i = totalDays; i >= 0; i -= step) {
      const d   = new Date(Date.now() - i * msPerDay);
      const key = d.toISOString().slice(0, 10);
      // For weekly step, sum 7 days
      let count = 0;
      for (let s = 0; s < step; s++) {
        const dk = new Date(d.getTime() + s * msPerDay).toISOString().slice(0, 10);
        count += map.get(dk) ?? 0;
      }
      result.push({
        day:   key,
        count,
        label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      });
    }
    return result;
  })();

  return (
    <s-page heading="Review Analytics">

      {/* ── Filters ──────────────────────────────────────────────────── */}
      <s-section>
        <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
          {/* Period */}
          <div style={{ display: "flex", gap: "4px" }}>
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => nav({ days: opt.value })}
                style={{
                  padding: "6px 14px",
                  border: "1px solid",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  borderColor: days === opt.value ? "#2563eb" : "#d1d5db",
                  background:  days === opt.value ? "#2563eb" : "#fff",
                  color:       days === opt.value ? "#fff"    : "#374151",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div style={{ width: "1px", height: "28px", background: "#e5e7eb" }} />

          {/* Review type */}
          <div style={{ display: "flex", gap: "4px" }}>
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => nav({ type: opt.value })}
                style={{
                  padding: "6px 14px",
                  border: "1px solid",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  borderColor: type === opt.value ? "#6b7280" : "#d1d5db",
                  background:  type === opt.value ? "#6b7280" : "#fff",
                  color:       type === opt.value ? "#fff"    : "#374151",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </s-section>

      {/* ── Metric cards ─────────────────────────────────────────────── */}
      <s-section>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <MetricCard
            label="Total reviews"
            value={fmt(data.totalReviews)}
            sub="All time"
          />
          <MetricCard
            label="Average rating"
            value={data.avgRating ? `${data.avgRating} ★` : "—"}
            sub="Approved reviews"
          />
          <MetricCard
            label={`New in last ${days} days`}
            value={fmt(data.newInPeriod)}
            subEl={
              <div style={{ marginTop: "4px" }}>
                {pctChange(data.periodPct)}{" "}
                <span style={{ fontSize: "11px", color: "#9ca3af" }}>vs prev period</span>
              </div>
            }
          />
          <MetricCard
            label="Published"
            value={fmt(data.statusDist.approved ?? 0)}
            sub={`${data.totalReviews > 0 ? Math.round(((data.statusDist.approved ?? 0) / data.totalReviews) * 100) : 0}% approval rate`}
          />
        </div>
      </s-section>

      {/* ── Reviews over time + Star distribution ────────────────────── */}
      <s-section heading="Reviews over time">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: "24px", alignItems: "start" }}>

          {/* Bar chart */}
          <div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  tickLine={false}
                  axisLine={false}
                  interval={Math.floor(chartData.length / 6)}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    fontSize: "12px",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                  }}
                  formatter={(v) => [fmt(Number(v)), "Reviews"]}
                  labelFormatter={(l) => l}
                />
                <Bar dataKey="count" fill="#2563eb" radius={[3, 3, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Star distribution */}
          <div>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "12px" }}>
              Star distribution
            </div>
            {ratingBars.map((row) => (
              <div key={row.stars} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <span style={{ fontSize: "12px", color: "#f59e0b", whiteSpace: "nowrap", minWidth: "60px" }}>
                  {starLabel(row.stars)}
                </span>
                <div style={{ flex: 1, height: "8px", borderRadius: "4px", background: "#f3f4f6", overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${row.pct}%`,
                    borderRadius: "4px",
                    background: row.stars >= 4 ? "#15803d" : row.stars === 3 ? "#ca8a04" : "#b91c1c",
                  }} />
                </div>
                <span style={{ fontSize: "11px", color: "#6b7280", minWidth: "36px", textAlign: "right" }}>
                  {row.pct}%
                </span>
                <span style={{ fontSize: "11px", color: "#9ca3af", minWidth: "28px", textAlign: "right" }}>
                  {fmt(row.count)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </s-section>

      {/* ── Status breakdown + Rating chart ──────────────────────────── */}
      <s-section heading="Breakdown">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>

          {/* Status pie */}
          <div>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "12px" }}>
              Review status
            </div>
            {statusPie.length > 0 ? (
              <div style={{ display: "flex", gap: "24px", alignItems: "center" }}>
                <PieChart width={160} height={160}>
                  <Pie
                    data={statusPie}
                    cx={75} cy={75}
                    innerRadius={48}
                    outerRadius={72}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {statusPie.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ fontSize: "12px", border: "1px solid #e5e7eb", borderRadius: "8px" }}
                    formatter={(v) => [fmt(Number(v)), ""]}
                  />
                </PieChart>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {statusPie.map((s) => (
                    <div key={s.name} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: s.color, flexShrink: 0 }} />
                      <span style={{ fontSize: "12px", color: "#374151" }}>{s.name}</span>
                      <span style={{ fontSize: "12px", fontWeight: 700, color: "#111827" }}>{fmt(s.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: "13px", color: "#9ca3af" }}>No data yet.</div>
            )}
          </div>

          {/* Rating bar chart */}
          <div>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "12px" }}>
              Reviews by star rating
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart
                data={ratingBars.map((r) => ({ name: `${r.stars}★`, count: r.count }))}
                margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "12px" }}
                  formatter={(v) => [fmt(Number(v)), "Reviews"]}
                />
                <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={36}>
                  {ratingBars.map((r) => (
                    <Cell
                      key={r.stars}
                      fill={r.stars >= 4 ? "#15803d" : r.stars === 3 ? "#ca8a04" : "#b91c1c"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </s-section>

    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
