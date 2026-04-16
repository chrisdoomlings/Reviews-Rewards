/**
 * Yotpo → Doomlings loyalty member migration
 *
 * Reads points.csv (Yotpo export) and upserts Customer + import Transaction
 * records into the database. Safe to re-run — all operations are idempotent.
 *
 * Usage:
 *   npx tsx scripts/migrate-yotpo-members.ts               # live run
 *   npx tsx scripts/migrate-yotpo-members.ts --dry-run     # preview only
 *   npx tsx scripts/migrate-yotpo-members.ts --only-balances # skip zero-balance rows
 *   npx tsx scripts/migrate-yotpo-members.ts --limit 500   # test with first 500 rows
 *
 * After running:
 *   - Customers get shopifyCustomerId = "yotpo_<email>" as a placeholder.
 *   - The first time a customer logs in via OTC, auth.server.ts should update
 *     shopifyCustomerId to the real Shopify customer ID (matched by shop + email).
 */

import { createReadStream } from "fs";
import { join }             from "path";
import { parse }            from "csv-parse";
import { readFileSync }     from "fs";
import { PrismaClient }     from "@prisma/client";

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
} catch {}

// ─── Config ───────────────────────────────────────────────────────────────────

const DRY_RUN       = process.argv.includes("--dry-run");
const ONLY_BALANCES = process.argv.includes("--only-balances");
const SHOP          = process.env.SHOPIFY_SHOP ?? "doomlings.myshopify.com";
const CSV_PATH      = join(process.cwd(), "points.csv");
const EXPIRY_MONTHS = 12;

// How many rows to upsert in one DB round-trip.
// Kept low to stay well within Supabase's PgBouncer connection pool limit.
const BATCH_SIZE = 50;

// Hard row cap for testing. Pass --limit 500 to trial on a small slice first.
const limitArg = process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1]
  ?? (process.argv.indexOf("--limit") !== -1
      ? process.argv[process.argv.indexOf("--limit") + 1]
      : null);
const ROW_LIMIT = limitArg ? parseInt(limitArg, 10) : Infinity;

const prisma = new PrismaClient();

// ─── Tier normalisation ───────────────────────────────────────────────────────

const TIER_MAP: Record<string, string> = {
  prepper:  "prepper",
  survivor: "survivor",
  ruler:    "ruler",
  none:     "prepper",   // no tier assigned → base tier
};

function normaliseTier(raw: string): string {
  return TIER_MAP[raw.toLowerCase().trim()] ?? "prepper";
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function parseUtcDate(raw: string): Date | null {
  if (!raw || raw.trim() === "" || raw.trim().toLowerCase() === "unknown") return null;
  const d = new Date(raw.trim().replace(" UTC", "Z"));
  return isNaN(d.getTime()) ? null : d;
}

function expiryDate(lastSeen: Date | null): Date {
  const base = lastSeen ?? new Date();
  const d    = new Date(base);
  d.setMonth(d.getMonth() + EXPIRY_MONTHS);
  return d;
}

// ─── CSV row type ─────────────────────────────────────────────────────────────

interface YotpoRow {
  email:                       string;
  first_name:                  string;
  last_name:                   string;
  points_earned:               string;
  points_balance:              string;
  last_seen:                   string;
  vip_tier:                    string;
  loyalty_eligible:            string;
  platform_account_created_at: string;
  created_at:                  string;
}

// ─── Counters ─────────────────────────────────────────────────────────────────

const stats = { total: 0, imported: 0, zeroBalance: 0, skipped: 0, errors: 0 };

// ─── Process one batch (sequential upserts — safe for connection pool) ────────

async function processBatch(rows: YotpoRow[]) {
  for (const row of rows) {
    const email         = row.email.toLowerCase().trim();
    const pointsBalance = Math.max(0, parseInt(row.points_balance, 10) || 0);
    const pointsEarned  = Math.max(0, parseInt(row.points_earned,  10) || 0);
    const tier          = normaliseTier(row.vip_tier);
    const lastSeen      = parseUtcDate(row.last_seen);
    const createdAt     = parseUtcDate(row.created_at) ?? new Date();
    const pointsExpiresAt = expiryDate(lastSeen);

    if (DRY_RUN) {
      pointsBalance > 0 ? stats.imported++ : stats.zeroBalance++;
      continue;
    }

    try {
      // Upsert the customer. On conflict (shop + email) we update loyalty fields
      // but intentionally leave shopifyCustomerId alone — it may already be a real
      // Shopify ID from a prior login.
      const customer = await prisma.customer.upsert({
        where:  { shop_email: { shop: SHOP, email } },
        create: {
          shopifyCustomerId: `yotpo_${email}`,
          shop:              SHOP,
          email,
          firstName:         row.first_name  || null,
          lastName:          row.last_name   || null,
          pointsBalance,
          tier,
          pointsExpiresAt,
          createdAt,
        },
        update: {
          firstName:         row.first_name  || null,
          lastName:          row.last_name   || null,
          pointsBalance,
          tier,
          pointsExpiresAt,
        },
        select: { id: true },
      });

      // Create the import transaction only if there's a balance and it's not
      // already there (re-run safety).
      if (pointsBalance > 0) {
        const alreadyImported = await prisma.transaction.findFirst({
          where: { customerId: customer.id, description: { startsWith: "Yotpo import" } },
          select: { id: true },
        });

        if (!alreadyImported) {
          await prisma.transaction.create({
            data: {
              customerId:  customer.id,
              type:        "earn",
              points:      pointsBalance,
              description: `Yotpo import — ${pointsEarned.toLocaleString()} pts lifetime earned`,
              createdAt,
            },
          });
        }

        stats.imported++;
      } else {
        stats.zeroBalance++;
      }
    } catch (err: any) {
      stats.errors++;
      console.error(`  Error [${email}]: ${err?.message ?? err}`);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\nYotpo member migration");
  console.log(`  CSV        : ${CSV_PATH}`);
  console.log(`  Shop       : ${SHOP}`);
  console.log(`  Batch size : ${BATCH_SIZE}`);
  console.log(`  Mode       : ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"}`);
  if (ONLY_BALANCES) console.log(`  Filter     : only members with points_balance > 0`);
  if (ROW_LIMIT !== Infinity) console.log(`  Limit      : first ${ROW_LIMIT.toLocaleString()} rows`);
  console.log("");

  const startTime = Date.now();
  let batch: YotpoRow[] = [];

  // ── Async iterator — safe with await, no double-fire risk ──────────────────
  const parser = createReadStream(CSV_PATH).pipe(
    parse({
      columns:            true,
      skip_empty_lines:   true,
      trim:               true,
      relax_column_count: true,   // tolerate rows where commas in names shift columns
    })
  );

  for await (const record of parser as AsyncIterable<YotpoRow>) {
    stats.total++;

    if (stats.total > ROW_LIMIT) break;

    const email   = record.email?.trim().toLowerCase() ?? "";
    const balance = parseInt(record.points_balance, 10) || 0;

    // Skip invalid / ineligible rows
    if (!email || !email.includes("@")) {
      stats.skipped++;
      continue;
    }
    if (record.loyalty_eligible?.trim().toLowerCase() === "false") {
      stats.skipped++;
      continue;
    }
    if (ONLY_BALANCES && balance === 0) {
      stats.skipped++;
      continue;
    }

    batch.push(record);

    if (batch.length >= BATCH_SIZE) {
      await processBatch(batch);
      batch = [];

      // Progress line every ~5 000 rows
      if (stats.total % 5000 < BATCH_SIZE) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const done    = stats.imported + stats.zeroBalance;
        const pct     = ROW_LIMIT !== Infinity
          ? ` (${Math.round((stats.total / ROW_LIMIT) * 100)}%)`
          : "";
        console.log(
          `  [${elapsed}s] ${stats.total.toLocaleString()} rows${pct} — ` +
          `done: ${done.toLocaleString()}, skipped: ${stats.skipped}, errors: ${stats.errors}`
        );
      }
    }
  }

  // Flush remaining rows
  if (batch.length > 0) await processBatch(batch);

  // ── Summary ───────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${"─".repeat(52)}`);
  console.log(`Completed in ${elapsed}s`);
  console.log(`  Total rows processed : ${stats.total.toLocaleString()}`);
  console.log(`  With balance (+ txn) : ${stats.imported.toLocaleString()}`);
  console.log(`  Zero balance         : ${stats.zeroBalance.toLocaleString()}`);
  console.log(`  Skipped              : ${stats.skipped.toLocaleString()}`);
  console.log(`  Errors               : ${stats.errors}`);
  if (DRY_RUN) console.log("\n  Nothing written — re-run without --dry-run to apply.");
  console.log("");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
