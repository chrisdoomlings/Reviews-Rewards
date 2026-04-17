/**
 * sync-yotpo-reviews.ts
 *
 * Syncs reviews from the Yotpo API into our DB.
 * Works for both full historical import and incremental updates.
 *
 * Usage:
 *   npx tsx scripts/sync-yotpo-reviews.ts                    # incremental (since last sync)
 *   npx tsx scripts/sync-yotpo-reviews.ts --full             # full historical import
 *   npx tsx scripts/sync-yotpo-reviews.ts --since 2024-01-01 # since a specific date
 *   npx tsx scripts/sync-yotpo-reviews.ts --dry-run          # parse + log, no DB writes
 *   npx tsx scripts/sync-yotpo-reviews.ts --full --limit 500 # cap for testing
 */

import { readFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { yotpoFetch } from "./yotpo-auth";

// ─── Load .env ────────────────────────────────────────────────────────────────
try {
  const envFile = readFileSync(join(process.cwd(), ".env"), "utf-8");
  for (const line of envFile.split("\n")) {
    const match = line.match(/^([^#\s][^=]*)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = val;
    }
  }
} catch { /* rely on env vars */ }

// ─── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argVal = (flag: string) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : undefined; };

const FULL    = args.includes("--full");
const DRY_RUN = args.includes("--dry-run");
const LIMIT   = argVal("--limit") ? parseInt(argVal("--limit")!, 10) : Infinity;
const SHOP    = argVal("--shop") ?? process.env.SHOPIFY_SHOP ?? "doomlings.myshopify.com";
const APP_KEY = process.env.YOTPO_APP_KEY!;

// --since overrides everything; --full fetches from the beginning
const SINCE_ARG = argVal("--since");

// ─── Prisma ───────────────────────────────────────────────────────────────────
// Use DIRECT_URL for scripts — bypasses PgBouncer which has connection_limit=1
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL } },
});

// ─── Yotpo review shape (simplified) ─────────────────────────────────────────
interface YotpoReview {
  id:              number;
  score:           number;
  votes_up:        number;
  votes_down:      number;
  content:         string;
  title:           string;
  created_at:      string;
  verified_buyer:  boolean;
  reviewer: {
    id:         number;
    display_name: string;
    email:      string;
  };
  product_id?: number | string;
  domain_key?: string; // product handle or id depending on Yotpo plan
}

interface YotpoReviewsResponse {
  status: { code: number; message: string };
  reviews: YotpoReview[];
  pagination?: {
    page:  number;
    per_page: number;
    total: number;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getLastSyncDate(): Promise<Date | null> {
  // Find the most recent Yotpo-sourced review in our DB
  const latest = await prisma.review.findFirst({
    where: { shop: SHOP, yotpoReviewId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return latest?.createdAt ?? null;
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

// ─── Retry helper ────────────────────────────────────────────────────────────

async function withRetry<T>(label: string, fn: () => Promise<T>, maxRetries = 4): Promise<T> {
  let delay = 3000;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const isConnErr = err?.code === "P1001" || err?.code === "P1008" || err?.code === "P1017"
        || err?.cause?.code === "ENOTFOUND" || err?.cause?.code === "ECONNRESET"
        || err?.cause?.code === "ETIMEDOUT";
      if (!isConnErr || attempt === maxRetries) throw err;
      console.warn(`  [retry ${attempt}/${maxRetries}] ${label} — waiting ${delay / 1000}s…`);
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
  throw new Error("unreachable");
}

// ─── Fetch one page of reviews from Yotpo ─────────────────────────────────────

async function fetchPage(page: number, sinceDate?: string): Promise<YotpoReviewsResponse> {
  const base = `https://api.yotpo.com/v1/apps/${APP_KEY}/reviews`;
  const params = new URLSearchParams({
    count:    "100",
    page:     String(page),
    ...(sinceDate ? { since_date: sinceDate } : {}),
  });

  const res = await yotpoFetch(`${base}?${params}`);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Yotpo reviews API error ${res.status}: ${body}`);
  }

  return res.json() as Promise<YotpoReviewsResponse>;
}

// ─── Upsert one review into our DB ────────────────────────────────────────────

async function upsertReview(r: YotpoReview): Promise<"created" | "updated" | "skipped"> {
  const yotpoReviewId = String(r.id);

  return withRetry(`review #${yotpoReviewId}`, async () => {
    // Try to match to an existing customer by email
    const customer = r.reviewer?.email
      ? await prisma.customer.findFirst({
          where: { shop: SHOP, email: r.reviewer.email.toLowerCase() },
          select: { id: true },
        })
      : null;

    const productId = r.domain_key ? String(r.domain_key) : (r.product_id ? String(r.product_id) : "site");

    const data = {
      shop:             SHOP,
      shopifyProductId: productId,
      rating:           Math.min(5, Math.max(1, Math.round(r.score))),
      title:            r.title || null,
      body:             r.content || null,
      status:           "approved" as const,
      verifiedPurchase: r.verified_buyer ?? false,
      reviewerName:     r.reviewer?.display_name || null,
      reviewerEmail:    r.reviewer?.email?.toLowerCase() || null,
      customerId:       customer?.id ?? null,
      createdAt:        new Date(r.created_at),
      yotpoReviewId,
    };

    const existing = await prisma.review.findFirst({
      where: { shop: SHOP, yotpoReviewId },
      select: { id: true },
    });

    if (existing) {
      await prisma.review.update({ where: { id: existing.id }, data });
      return "created" as const;
    }

    await prisma.review.create({ data });
    return "created" as const;
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!APP_KEY) throw new Error("YOTPO_APP_KEY is not set");

  // Determine since_date
  let sinceDate: string | undefined;

  if (SINCE_ARG) {
    sinceDate = SINCE_ARG;
    console.log(`[sync] mode=custom since=${sinceDate}`);
  } else if (FULL) {
    sinceDate = undefined;
    console.log("[sync] mode=full (all history)");
  } else {
    const lastSync = await getLastSyncDate();
    if (lastSync) {
      // Go back 1 day to catch any reviews that arrived out of order
      const from = new Date(lastSync.getTime() - 24 * 60 * 60 * 1000);
      sinceDate = toISODate(from);
      console.log(`[sync] mode=incremental since=${sinceDate}`);
    } else {
      console.log("[sync] no previous import found — doing full import");
      sinceDate = undefined;
    }
  }

  if (DRY_RUN) console.log("[sync] DRY RUN — no DB writes");

  let page     = 1;
  let total    = 0;
  let created  = 0;
  let updated  = 0;
  let skipped  = 0;
  let fetched  = 0;

  while (true) {
    console.log(`[sync] fetching page ${page}… (fetched so far: ${fetched})`);
    const data = await withRetry(`page ${page}`, () => fetchPage(page, sinceDate));

    const reviews = data.reviews ?? [];
    if (reviews.length === 0) {
      console.log("[sync] no more reviews — done");
      break;
    }

    total = data.pagination?.total ?? total;

    for (const r of reviews) {
      fetched++;
      if (fetched > LIMIT) break;

      if (DRY_RUN) {
        console.log(`  [dry] #${r.id} rating=${r.score} "${r.title?.slice(0, 40)}"`);
        continue;
      }

      const result = await upsertReview(r);
      if (result === "created") created++;
      else if (result === "updated") updated++;
      else skipped++;
    }

    if (fetched > LIMIT) {
      console.log(`[sync] --limit ${LIMIT} reached — stopping`);
      break;
    }

    // Check if there are more pages
    const perPage = data.pagination?.per_page ?? 100;
    if (reviews.length < perPage) break;

    page++;

    // Brief pause to be a good API citizen
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`\n[sync] complete`);
  console.log(`  fetched : ${fetched}`);
  if (!DRY_RUN) {
    console.log(`  created : ${created}`);
    console.log(`  updated : ${updated}`);
    console.log(`  skipped : ${skipped}`);
  }
  console.log(`  total (Yotpo reported): ${total}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
