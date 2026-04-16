/**
 * POST /api/auth/silent
 *
 * Silent re-auth check. Called by the widget on return visits when the customer
 * has a stored customerId in localStorage. Verifies the IP matches a recent
 * verified LoginSession — if so, the widget can skip the OTC flow.
 *
 * Body: { shop: string, shopifyCustomerId: string }
 * Response: { allowed: boolean }
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { corsJson, corsPreflight } from "../cors.server";
import { canSilentReauth } from "../auth.server";
import { getShopConfig } from "../loyalty.server";

export const loader = ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") return corsPreflight();
  return new Response("Method Not Allowed", { status: 405 });
};

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") return corsPreflight();
  if (request.method !== "POST")
    return corsJson({ error: "Method not allowed" }, { status: 405 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object")
    return corsJson({ error: "Invalid request body" }, { status: 400 });

  const { shop, shopifyCustomerId } = body as {
    shop?:              string;
    shopifyCustomerId?: string;
  };

  if (!shop || !shopifyCustomerId)
    return corsJson({ allowed: false });

  const ip = (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "0.0.0.0"
  );

  const config  = await getShopConfig(shop);
  const allowed = await canSilentReauth(shopifyCustomerId, ip, config.silentReauthDays);

  return corsJson({ allowed });
}
