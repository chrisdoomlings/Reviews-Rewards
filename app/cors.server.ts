/** Shared CORS headers for all public storefront-facing API routes. */
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

/** Wrap a JSON response with CORS headers. */
export function corsJson(body: unknown, init: ResponseInit = {}): Response {
  const existing = init.headers instanceof Headers
    ? Object.fromEntries(init.headers.entries())
    : (init.headers as Record<string, string> | undefined) ?? {};

  return Response.json(body, {
    ...init,
    headers: { ...CORS_HEADERS, ...existing },
  });
}

/** 204 preflight response for OPTIONS requests. */
export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
