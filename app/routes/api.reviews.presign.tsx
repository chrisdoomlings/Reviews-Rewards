import { randomUUID } from "crypto";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { getPresignedUploadUrl } from "../r2.server";
import { corsJson, corsPreflight, CORS_HEADERS } from "../cors.server";

export const loader = ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") return corsPreflight();
  return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
};

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
    return corsJson({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return corsJson({ error: "Invalid request body" }, { status: 400 });
  }

  const { type, contentType } = body as { type: string; contentType: string };

  if (type === "photo") {
    const ext = PHOTO_TYPES[contentType];
    if (!ext) return corsJson({ error: "Unsupported photo content type" }, { status: 400 });
    const key = `uploads/photos/${Date.now()}-${randomUUID()}.${ext}`;
    const uploadUrl = await getPresignedUploadUrl(key, contentType);
    return corsJson({ uploadUrl, key });
  }

  if (type === "video") {
    const ext = VIDEO_TYPES[contentType];
    if (!ext) return corsJson({ error: "Unsupported video content type" }, { status: 400 });
    const key = `uploads/videos/${Date.now()}-${randomUUID()}.${ext}`;
    // 10 minutes for large video uploads
    const uploadUrl = await getPresignedUploadUrl(key, contentType, 600);
    return corsJson({ uploadUrl, key });
  }

  return corsJson({ error: "type must be 'photo' or 'video'" }, { status: 400 });
}
