import { useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return {};
};

const integrationCards = [
  {
    name: "Shopify app",
    status: "Connected",
    detail: "Embedded admin, webhooks, discount generation, and customer session flows.",
  },
  {
    name: "Video storage",
    status: "Ready for setup",
    detail: "Cloudflare R2 preferred, with processed/public media separated from raw uploads.",
  },
  {
    name: "Pebble theme extension",
    status: "Needs QA",
    detail: "Confirm app block placement on PDP, cart, and account templates for the active theme version.",
  },
];

const statusColor: Record<string, { background: string; color: string }> = {
  Connected: { background: "#dff7e5", color: "#0a7d45" },
  "Needs credentials": { background: "#fff1d6", color: "#9a6700" },
  "Ready for setup": { background: "#e8f2ff", color: "#005bd3" },
  "Needs QA": { background: "#fde8e8", color: "#b42318" },
};

export default function Settings() {
  const [pointsName, setPointsName] = useState("Doom Points");
  const [launcherCorner, setLauncherCorner] = useState("bottom-right");
  const [sessionDays, setSessionDays] = useState("30");
  const [pointsExpiry, setPointsExpiry] = useState("12");
  const [expiryWarning, setExpiryWarning] = useState("30");
  const [maxVideoSize, setMaxVideoSize] = useState("100");
  const [maxVideoDuration, setMaxVideoDuration] = useState("60");

  return (
    <s-page heading="Program settings">
      <s-section heading="Integration readiness">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "12px",
          }}
        >
          {integrationCards.map((card) => (
            <div
              key={card.name}
              style={{
                border: "1px solid #e1e3e5",
                borderRadius: "12px",
                padding: "16px",
                background: "#fff",
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
                <div style={{ fontWeight: 600 }}>{card.name}</div>
                <span
                  style={{
                    background: statusColor[card.status].background,
                    color: statusColor[card.status].color,
                    padding: "4px 10px",
                    borderRadius: "999px",
                    fontSize: "12px",
                    fontWeight: 600,
                  }}
                >
                  {card.status}
                </span>
              </div>
              <div style={{ fontSize: "13px", color: "#5c5f62", lineHeight: 1.5 }}>
                {card.detail}
              </div>
            </div>
          ))}
        </div>
      </s-section>

      <s-section heading="Branding and storefront behavior">
        <s-stack direction="block" gap="base">
          <s-text-field
            label="Points currency"
            value={pointsName}
            onInput={(event: any) => setPointsName(event.target.value)}
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
            <s-select
              label="Loyalty launcher position"
              value={launcherCorner}
              onInput={(event: any) => setLauncherCorner(event.target.value)}
            >
              <s-option value="bottom-right">Bottom right</s-option>
              <s-option value="bottom-left">Bottom left</s-option>
            </s-select>
            <s-text-field
              label="Silent session duration (days)"
              value={sessionDays}
              onInput={(event: any) => setSessionDays(event.target.value)}
            />
          </div>
        </s-stack>
      </s-section>

      <s-section heading="Points lifecycle">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
          <s-text-field
            label="Points expiry window (months)"
            value={pointsExpiry}
            onInput={(event: any) => setPointsExpiry(event.target.value)}
          />
          <s-text-field
            label="Expiry warning lead time (days)"
            value={expiryWarning}
            onInput={(event: any) => setExpiryWarning(event.target.value)}
          />
        </div>
      </s-section>

      <s-section heading="Video review limits">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
          <s-text-field
            label="Maximum upload size (MB)"
            value={maxVideoSize}
            onInput={(event: any) => setMaxVideoSize(event.target.value)}
          />
          <s-text-field
            label="Maximum duration (seconds)"
            value={maxVideoDuration}
            onInput={(event: any) => setMaxVideoDuration(event.target.value)}
          />
        </div>
      </s-section>

      <s-section heading="Operational notes">
        <s-stack direction="block" gap="base">
          {[
            "Do not edit Pebble theme source directly; keep storefront UI in app blocks and app embeds.",
            "Keep raw and processed video assets in separate storage prefixes with 90-day raw retention.",
            "Treat Ends with Benefits parity as a blocker before editing live tier thresholds or point rules.",
            "Coordinate review request timing with Attentive so lifecycle messaging does not overlap.",
          ].map((note) => (
            <div
              key={note}
              style={{
                padding: "12px 14px",
                border: "1px solid #e1e3e5",
                borderRadius: "10px",
                background: "#fff",
                fontSize: "13px",
                color: "#5c5f62",
              }}
            >
              {note}
            </div>
          ))}
        </s-stack>
      </s-section>

      <s-section>
        <s-button variant="primary">Save settings</s-button>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
