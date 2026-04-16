/**
 * POST /api/auth/request-otc
 *
 * Generates a 4-digit OTC and sends it via Resend to the supplied email.
 * Always returns { sent: true } regardless of whether the email exists (prevents enumeration).
 *
 * Body: { shop: string, email: string }
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { corsJson, corsPreflight } from "../cors.server";
import { requestOtc } from "../auth.server";

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

  const { shop, email } = body as { shop?: string; email?: string };

  if (!shop || !email)
    return corsJson({ error: "shop and email are required" }, { status: 400 });

  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return corsJson({ error: "Invalid email address" }, { status: 400 });

  const ip = (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "0.0.0.0"
  );
  const ua = request.headers.get("user-agent") ?? "";

  await requestOtc({ shop, email, ipAddress: ip, userAgent: ua });

  return corsJson({ sent: true });
}
