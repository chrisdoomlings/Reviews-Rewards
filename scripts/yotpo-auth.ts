/**
 * yotpo-auth.ts
 *
 * Handles Yotpo OAuth token lifecycle.
 * - Fetches a token using app_key + secret
 * - Caches it in memory until 2 minutes before expiry
 * - Auto-refreshes transparently — callers just call getToken()
 *
 * Token lifetime: 3600 seconds (60 min)
 * Refresh margin: 120 seconds before expiry
 */

const YOTPO_TOKEN_URL = "https://api.yotpo.com/oauth/token";
const REFRESH_MARGIN_MS = 2 * 60 * 1000; // refresh 2 min before expiry

interface TokenCache {
  accessToken: string;
  expiresAt: number; // ms since epoch
}

let cached: TokenCache | null = null;

export async function getYotpoToken(): Promise<string> {
  const now = Date.now();

  if (cached && cached.expiresAt - now > REFRESH_MARGIN_MS) {
    return cached.accessToken;
  }

  const appKey = process.env.YOTPO_APP_KEY;
  const secret = process.env.YOTPO_SECRET_KEY;

  if (!appKey || !secret) {
    throw new Error("YOTPO_APP_KEY and YOTPO_SECRET_KEY must be set in .env");
  }

  console.log("[yotpo-auth] fetching new access token…");

  let res: Response | undefined;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      res = await fetch(YOTPO_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id:     appKey,
          client_secret: secret,
          grant_type:    "client_credentials",
        }),
      });
      break;
    } catch (err) {
      lastErr = err;
      const wait = attempt * 5000;
      console.warn(`[yotpo-auth] network error on attempt ${attempt}/5 — retrying in ${wait / 1000}s…`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  if (!res) throw new Error(`Yotpo token fetch failed after 5 attempts: ${lastErr}`);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Yotpo token request failed ${res.status}: ${body}`);
  }

  const data = await res.json() as {
    access_token: string;
    token_type:   string;
    created_at?:  number; // unix seconds
  };

  if (!data.access_token) {
    throw new Error(`Yotpo token response missing access_token: ${JSON.stringify(data)}`);
  }

  // Yotpo tokens live for 3600 s from created_at (or from now if not provided)
  const createdAt = data.created_at ? data.created_at * 1000 : Date.now();
  cached = {
    accessToken: data.access_token,
    expiresAt:   createdAt + 3600 * 1000,
  };

  const expiresIn = Math.round((cached.expiresAt - Date.now()) / 1000);
  console.log(`[yotpo-auth] new token obtained — expires in ${expiresIn}s`);

  return cached.accessToken;
}

/**
 * Thin fetch wrapper that always injects a fresh token.
 * Use this instead of raw fetch for all Yotpo API calls.
 */
export async function yotpoFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  const token = await getYotpoToken();

  // Yotpo accepts the token as a query param (utoken) or Authorization header
  const separator = url.includes("?") ? "&" : "?";
  const urlWithToken = `${url}${separator}utoken=${token}`;

  const res = await fetch(urlWithToken, opts);

  // If 401, the token may have been revoked mid-run — retry once with a fresh token
  if (res.status === 401) {
    console.warn("[yotpo-auth] 401 received — forcing token refresh and retrying…");
    cached = null;
    const freshToken = await getYotpoToken();
    const sep2 = url.includes("?") ? "&" : "?";
    return fetch(`${url}${sep2}utoken=${freshToken}`, opts);
  }

  return res;
}
