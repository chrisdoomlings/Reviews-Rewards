/**
 * Yotpo → Doomlings loyalty member migration
 *
 * Reads points.csv and upserts Customer + import Transaction records.
 * Safe to re-run — all operations are idempotent.
 *
 * Usage:
 *   npx tsx scripts/migrate-yotpo-members.ts               # live run
 *   npx tsx scripts/migrate-yotpo-members.ts --dry-run     # preview only
 *   npx tsx scripts/migrate-yotpo-members.ts --only-balances
 *   npx tsx scripts/migrate-yotpo-members.ts --limit 500
 *
 * Performance: ~3 DB queries per 250-row batch (not per row).
 * Retry: up to 4 attempts with backoff on connection errors.
 */

import { createReadStream } from "fs";
import { join }             from "path";
import { parse }            from "csv-parse";
import { readFileSync }     from "fs";
import { randomUUID }       from "crypto";
import { PrismaClient, Prisma } from "@prisma/client";

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
const BATCH_SIZE    = 250;
const MAX_RETRIES   = 4;
const RETRY_DELAY   = 3000; // ms — doubles each attempt

const limitArg = process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1]
  ?? (process.argv.indexOf("--limit") !== -1
      ? process.argv[process.argv.indexOf("--limit") + 1]
      : null);
const ROW_LIMIT = limitArg ? parseInt(limitArg, 10) : Infinity;

// Use DIRECT_URL for scripts — bypasses PgBouncer which has connection_limit=1
const prisma = new PrismaClient({ log: [], datasources: { db: { url: process.env.DIRECT_URL } } });

// ─── Retry wrapper ────────────────────────────────────────────────────────────

const RETRYABLE = ["P1001", "P1008", "P1017", "P2024"];

async function withRetry<T>(fn: () => Promise<T>, label = ""): Promise<T> {
  let delay = RETRY_DELAY;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const code = err?.code ?? "";
      const isRetryable = RETRYABLE.includes(code) || err?.message?.includes("Can't reach");
      if (!isRetryable || attempt === MAX_RETRIES) throw err;
      console.log(`  [retry ${attempt}/${MAX_RETRIES - 1}] ${label} — waiting ${delay / 1000}s…`);
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
  throw new Error("unreachable");
}

// ─── Tier normalisation ───────────────────────────────────────────────────────

const TIER_MAP: Record<string, string> = {
  prepper:  "prepper",
  survivor: "survivor",
  ruler:    "ruler",
  none:     "prepper",
};
function normaliseTier(raw: string): string {
  return TIER_MAP[raw.toLowerCase().trim()] ?? "prepper";
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function parseUtcDate(raw: string): Date | null {
  if (!raw || raw.trim().toLowerCase() === "unknown") return null;
  const d = new Date(raw.trim().replace(" UTC", "Z"));
  return isNaN(d.getTime()) ? null : d;
}
function expiryDate(lastSeen: Date | null): Date {
  const d = new Date(lastSeen ?? new Date());
  d.setMonth(d.getMonth() + EXPIRY_MONTHS);
  return d;
}

// ─── Parsed row ───────────────────────────────────────────────────────────────

interface ParsedRow {
  email:          string;
  firstName:      string | null;
  lastName:       string | null;
  pointsBalance:  number;
  pointsEarned:   number;
  tier:           string;
  pointsExpiresAt: Date;
  createdAt:      Date;
}

function parseRow(raw: Record<string, string>): ParsedRow | null {
  const email = raw.email?.trim().toLowerCase();
  if (!email || !email.includes("@")) return null;
  if (raw.loyalty_eligible?.trim().toLowerCase() === "false") return null;

  const pointsBalance = Math.max(0, parseInt(raw.points_balance, 10) || 0);
  if (ONLY_BALANCES && pointsBalance === 0) return null;

  return {
    email,
    firstName:       raw.first_name || null,
    lastName:        raw.last_name  || null,
    pointsBalance,
    pointsEarned:    Math.max(0, parseInt(raw.points_earned, 10) || 0),
    tier:            normaliseTier(raw.vip_tier ?? ""),
    pointsExpiresAt: expiryDate(parseUtcDate(raw.last_seen)),
    createdAt:       parseUtcDate(raw.created_at) ?? new Date(),
  };
}

// ─── Counters ─────────────────────────────────────────────────────────────────

const stats = { total: 0, imported: 0, zeroBalance: 0, skipped: 0, errors: 0 };

// ─── Process one batch ────────────────────────────────────────────────────────
// 3 DB round-trips per batch regardless of batch size:
//   1. Batch upsert customers (raw SQL — INSERT … ON CONFLICT DO UPDATE … RETURNING)
//   2. Find existing Yotpo import transactions for this batch
//   3. createMany new transactions

async function processBatch(rows: ParsedRow[]) {
  if (rows.length === 0) return;

  if (DRY_RUN) {
    rows.forEach((r) => (r.pointsBalance > 0 ? stats.imported++ : stats.zeroBalance++));
    return;
  }

  const now = new Date();

  // 1. Batch upsert customers ─────────────────────────────────────────────────
  let upserted: { id: string; email: string }[] = [];
  try {
    upserted = await withRetry(
      () =>
        prisma.$queryRaw<{ id: string; email: string }[]>`
          INSERT INTO "Customer" (
            "id", "shopifyCustomerId", "shop", "email",
            "firstName", "lastName", "pointsBalance", "tier",
            "pointsExpiresAt", "createdAt", "updatedAt"
          )
          VALUES ${Prisma.join(
            rows.map((r) =>
              Prisma.sql`(
                ${randomUUID()},
                ${"yotpo_" + r.email},
                ${SHOP},
                ${r.email},
                ${r.firstName},
                ${r.lastName},
                ${r.pointsBalance},
                ${r.tier},
                ${r.pointsExpiresAt},
                ${r.createdAt},
                ${now}
              )`
            )
          )}
          ON CONFLICT ("shop", "email") DO UPDATE SET
            "firstName"       = EXCLUDED."firstName",
            "lastName"        = EXCLUDED."lastName",
            "pointsBalance"   = EXCLUDED."pointsBalance",
            "tier"            = EXCLUDED."tier",
            "pointsExpiresAt" = EXCLUDED."pointsExpiresAt",
            "updatedAt"       = EXCLUDED."updatedAt"
          RETURNING "id", "email"
        `,
      "customer upsert"
    );
  } catch (err: any) {
    stats.errors += rows.length;
    console.error(`  Batch upsert failed: ${err?.message ?? err}`);
    return;
  }

  const emailToId = new Map(upserted.map((c) => [c.email, c.id]));

  // 2+3. Transactions for rows with balance ───────────────────────────────────
  const withBalance = rows.filter((r) => r.pointsBalance > 0);
  const withBalanceIds = withBalance
    .map((r) => emailToId.get(r.email))
    .filter((id): id is string => Boolean(id));

  if (withBalanceIds.length > 0) {
    try {
      // Check which customers already have a Yotpo import transaction
      const existing = await withRetry(
        () =>
          prisma.transaction.findMany({
            where: {
              customerId:  { in: withBalanceIds },
              description: { startsWith: "Yotpo import" },
            },
            select: { customerId: true },
          }),
        "check existing txns"
      );
      const alreadyImported = new Set(existing.map((t) => t.customerId));

      const newTxns = withBalance
        .map((r) => {
          const customerId = emailToId.get(r.email);
          if (!customerId || alreadyImported.has(customerId)) return null;
          return {
            customerId,
            type:        "earn",
            points:      r.pointsBalance,
            description: `Yotpo import — ${r.pointsEarned.toLocaleString()} pts lifetime earned`,
            createdAt:   r.createdAt,
          };
        })
        .filter((t): t is NonNullable<typeof t> => t !== null);

      if (newTxns.length > 0) {
        await withRetry(
          () => prisma.transaction.createMany({ data: newTxns }),
          "create txns"
        );
      }
    } catch (err: any) {
      console.error(`  Transaction batch failed: ${err?.message ?? err}`);
      // Customers were upserted successfully — only transactions failed.
      // Non-fatal: re-running the script will fill in the missing transactions.
    }
  }

  stats.imported    += withBalance.length;
  stats.zeroBalance += rows.length - withBalance.length;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\nYotpo member migration");
  console.log(`  CSV        : ${CSV_PATH}`);
  console.log(`  Shop       : ${SHOP}`);
  console.log(`  Batch size : ${BATCH_SIZE} rows → ~3 DB queries/batch`);
  console.log(`  Retries    : up to ${MAX_RETRIES} attempts per batch`);
  console.log(`  Mode       : ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"}`);
  if (ONLY_BALANCES) console.log(`  Filter     : only members with points_balance > 0`);
  if (ROW_LIMIT !== Infinity) console.log(`  Limit      : first ${ROW_LIMIT.toLocaleString()} rows`);
  console.log("");

  // Verify connection before streaming 130k rows
  if (!DRY_RUN) {
    process.stdout.write("  Checking DB connection… ");
    try {
      await withRetry(() => prisma.$queryRaw`SELECT 1`, "ping");
      console.log("OK\n");
    } catch {
      console.log("FAILED\n");
      console.error("  Cannot reach the database. Check Supabase dashboard and try again.");
      process.exit(1);
    }
  }

  const startTime = Date.now();
  let batch: ParsedRow[] = [];

  const parser = createReadStream(CSV_PATH).pipe(
    parse({
      columns:            true,
      skip_empty_lines:   true,
      trim:               true,
      relax_column_count: true,
    })
  );

  for await (const raw of parser as AsyncIterable<Record<string, string>>) {
    stats.total++;
    if (stats.total > ROW_LIMIT) break;

    const row = parseRow(raw);
    if (!row) { stats.skipped++; continue; }

    batch.push(row);

    if (batch.length >= BATCH_SIZE) {
      await processBatch(batch);
      batch = [];

      if ((stats.imported + stats.zeroBalance) % 5000 < BATCH_SIZE) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const pct     = ROW_LIMIT !== Infinity ? ` (${Math.round((stats.total / ROW_LIMIT) * 100)}%)` : "";
        console.log(
          `  [${elapsed}s] ${stats.total.toLocaleString()} rows${pct} — ` +
          `with balance: ${stats.imported.toLocaleString()}, ` +
          `zero: ${stats.zeroBalance.toLocaleString()}, ` +
          `errors: ${stats.errors}`
        );
      }
    }
  }

  if (batch.length > 0) await processBatch(batch);

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
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
