import { randomUUID } from "crypto";
import type { ActionFunctionArgs } from "react-router";
import { getPresignedUploadUrl } from "../r2.server";

export const loader = () => new Response("Method Not Allowed", { status: 405 });

const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { type, contentType } = body as { type: string; contentType: string };

  if (type === "photo") {
    const ext = PHOTO_TYPES[contentType];
    if (!ext) return Response.json({ error: "Unsupported photo content type" }, { status: 400 });
    const key = `uploads/photos/${Date.now()}-${randomUUID()}.${ext}`;
    const uploadUrl = await getPresignedUploadUrl(key, contentType);
    return Response.json({ uploadUrl, key });
  }

  if (type === "video") {
    const ext = VIDEO_TYPES[contentType];
    if (!ext) return Response.json({ error: "Unsupported video content type" }, { status: 400 });
    const key = `uploads/videos/${Date.now()}-${randomUUID()}.${ext}`;
    // 10 minutes for large video uploads
    const uploadUrl = await getPresignedUploadUrl(key, contentType, 600);
    return Response.json({ uploadUrl, key });
  }

  return Response.json({ error: "type must be 'photo' or 'video'" }, { status: 400 });
}
