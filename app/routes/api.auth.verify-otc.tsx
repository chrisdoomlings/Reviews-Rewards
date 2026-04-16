/**
 * POST /api/auth/verify-otc
 *
 * Verifies a 4-digit OTC. On success returns the customer's Shopify ID
 * and — on Shopify Plus with MULTIPASS_SECRET configured — a Multipass URL
 * that logs the customer into their Shopify account.
 *
 * Body: { shop: string, email: string, code: string }
 *
 * Response (success):
 *   { customerId: string, email: string, firstName: string|null, multipassUrl?: string }
 *
 * Response (failure):
 *   { error: string }  with status 401
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { corsJson, corsPreflight } from "../cors.server";
import { verifyOtc } from "../auth.server";

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

  const { shop, email, code } = body as {
    shop?:  string;
    email?: string;
    code?:  string;
  };

  if (!shop || !email || !code)
    return corsJson({ error: "shop, email, and code are required" }, { status: 400 });

  const ip = (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "0.0.0.0"
  );

  const result = await verifyOtc(shop, email, code, ip);

  if (!result.success) {
    return corsJson({ error: result.error }, { status: 401 });
  }

  return corsJson({
    customerId:   result.customerId,
    email:        result.email,
    firstName:    result.firstName ?? null,
    multipassUrl: result.multipassUrl ?? null,
  });
}
