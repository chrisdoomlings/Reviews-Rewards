/**
 * POST /api/webhooks/video-transcoded
 *
 * Called by a Cloudflare Worker after transcoding a video review to H.264 720p.
 * Updates the ReviewVideo record with the processed key and marks it ready.
 *
 * Authentication: shared secret in Authorization header.
 * Set WEBHOOK_SECRET env var to the same value configured in the Worker.
 *
 * Expected body:
 *   { videoId: string, r2KeyProcessed: string, durationSecs?: number }
 */

import type { ActionFunctionArgs } from "react-router";
import prisma from "../db.server";

export const loader = () => new Response("Method Not Allowed", { status: 405 });

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  // Verify shared secret
  const secret = process.env.WEBHOOK_SECRET;
  if (secret) {
    const auth = request.headers.get("Authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const { videoId, r2KeyProcessed, durationSecs } = body as {
    videoId: string;
    r2KeyProcessed: string;
    durationSecs?: number;
  };

  if (!videoId || !r2KeyProcessed) {
    return Response.json({ error: "videoId and r2KeyProcessed are required" }, { status: 400 });
  }

  const video = await prisma.reviewVideo.findUnique({ where: { id: videoId } });
  if (!video) {
    return Response.json({ error: "Video not found" }, { status: 404 });
  }

  await prisma.reviewVideo.update({
    where: { id: videoId },
    data: {
      r2KeyProcessed,
      status: "ready",
      ...(durationSecs != null ? { durationSecs } : {}),
    },
  });

  return Response.json({ ok: true });
}
