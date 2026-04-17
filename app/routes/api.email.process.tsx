/**
 * GET /api/email/process
 *
 * Called by Vercel Cron every 5 minutes.
 * Processes all pending EmailJob rows whose scheduledFor <= now.
 *
 * Protected by a shared secret so it can't be triggered by anyone on the internet.
 */

import type { LoaderFunctionArgs } from "react-router";
import { processPendingEmails } from "../email.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Verify cron secret
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  try {
    const result = await processPendingEmails();
    console.log(`[email-cron] sent=${result.sent} failed=${result.failed}`);
    return new Response(
      JSON.stringify({ ok: true, ...result }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[email-cron] fatal error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
