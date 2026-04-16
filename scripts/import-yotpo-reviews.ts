/**
 * Yotpo review importer
 *
 * Usage:
 *   npx tsx scripts/import-yotpo-reviews.ts --limit 5
 *   npx tsx scripts/import-yotpo-reviews.ts --limit 5 --dry-run
 *   npx tsx scripts/import-yotpo-reviews.ts              # imports all
 *
 * Flags:
 *   --limit N     only process the first N rows
 *   --dry-run     parse + log but skip all DB writes and R2 uploads
 *   --shop <host> Shopify shop domain (default: reads SHOPIFY_SHOP from .env)
 */

import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// ─── Load .env manually (no dotenv dep needed) ────────────────────────────────
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
} catch {
  // .env not found — rely on environment variables already set
}

// ─── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

function argValue(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
}

const LIMIT    = argValue("--limit") ? parseInt(argValue("--limit")!, 10) : Infinity;
const DRY_RUN  = args.includes("--dry-run");
const SHOP     = argValue("--shop") ?? process.env.SHOPIFY_SHOP ?? "doomlings.myshopify.com";
const CSV_PATH = join(process.cwd(), "reviews.csv");

// ─── Clients ──────────────────────────────────────────────────────────────────
const prisma = new PrismaClient();

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

// ─── Image mirroring ──────────────────────────────────────────────────────────
async function mirrorImage(
  yotpoUrl: string,
  yotpoReviewId: string,
  index: number,
): Promise<{ key: string; url: string }> {
  const res = await fetch(yotpoUrl, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const buffer     = Buffer.from(await res.arrayBuffer());
  const ext        = (yotpoUrl.split(".").pop() ?? "jpg").split("?")[0].toLowerCase();
  const contentType = res.headers.get("content-type") ?? "image/jpeg";

  // Deterministic key → safe to re-run without creating duplicate R2 objects
  const key = `review-photos/yotpo-${yotpoReviewId}-${index}.${ext}`;

  if (!DRY_RUN) {
    await r2.send(
      new PutObjectCommand({
        Bucket:      process.env.R2_BUCKET_NAME!,
        Key:         key,
        Body:        buffer,
        ContentType: contentType,
      }),
    );
  }

  return { key, url: `${process.env.R2_PUBLIC_URL}/${key}` };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nYotpo review importer`);
  console.log(`  CSV   : ${CSV_PATH}`);
  console.log(`  Shop  : ${SHOP}`);
  console.log(`  Limit : ${LIMIT === Infinity ? "all" : LIMIT}`);
  console.log(`  Mode  : ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"}\n`);

  const raw = readFileSync(CSV_PATH, "utf-8");

  const records: Record<string, string>[] = parse(raw, {
    columns:             true,
    skip_empty_lines:    true,
    relax_quotes:        true,
    relax_column_count:  true,
    trim:                false,       // we trim per-field below
  });

  const toProcess = LIMIT === Infinity ? records : records.slice(0, LIMIT);
  console.log(`Rows to process: ${toProcess.length} of ${records.length} total\n`);

  let imported = 0;
  let skipped  = 0;
  let errors   = 0;

  for (const row of toProcess) {
    const yotpoReviewId = row["Review ID"]?.trim();
    if (!yotpoReviewId) {
      console.warn(`Row missing Review ID — skipping`);
      skipped++;
      continue;
    }

    const reviewType     = row["Review Type"]?.trim();
    const productId      = row["Product ID"]?.trim();
    const ratingRaw      = parseInt(row["Review Score"]?.trim(), 10);

    if (isNaN(ratingRaw) || ratingRaw < 1 || ratingRaw > 5) {
      console.warn(`[${yotpoReviewId}] Invalid rating "${row["Review Score"]}" — skipping`);
      skipped++;
      continue;
    }

    // site_review has no product → sentinel value
    const shopifyProductId =
      reviewType === "site_review" || !productId ? "site" : productId;

    const orderId         = row["Order ID"]?.trim() || null;
    const verifiedPurchase = !!orderId;
    const status          = row["Review Status"]?.trim() === "Published" ? "approved" : "pending";
    const createdAt       = row["Review Creation Date"]
      ? new Date(row["Review Creation Date"])
      : new Date();

    // Images: semicolon-separated, may have spaces around separator
    const imageUrlsRaw = row["Published Image URLs"]?.trim() ?? "";
    const imageUrls    = imageUrlsRaw
      ? imageUrlsRaw.split(";").map((u) => u.trim()).filter(Boolean)
      : [];

    const reviewerName  = row["Reviewer Display Name"]?.trim() || null;
    const reviewerEmail = row["Reviewer Email"]?.trim() || null;
    const flagged       = row["Profanity Flag"]?.trim() === "1";

    console.log(
      `[${imported + skipped + errors + 1}] ${yotpoReviewId} ` +
      `| ★${ratingRaw} | ${reviewType} | ${imageUrls.length} img(s) ` +
      `| "${row["Review Title"]?.trim().slice(0, 50)}"`,
    );

    try {
      if (DRY_RUN) {
        console.log(
          `  → [dry-run] would upsert review + mirror ${imageUrls.length} image(s)`,
        );
      } else {
        const review = await prisma.review.upsert({
          where:  { yotpoReviewId },
          create: {
            shop:          SHOP,
            yotpoReviewId,
            shopifyProductId,
            shopifyOrderId:  orderId,
            rating:          ratingRaw,
            title:           row["Review Title"]?.trim() || null,
            body:            row["Review Content"]?.trim() || null,
            status,
            verifiedPurchase,
            flagged,
            reviewerName,
            reviewerEmail,
            createdAt,
          },
          update: {}, // idempotent — don't overwrite on re-run
        });

        // Mirror each image to R2
        for (let i = 0; i < imageUrls.length; i++) {
          try {
            const { key, url } = await mirrorImage(imageUrls[i], yotpoReviewId, i);
            // Only insert photo row if it doesn't already exist (re-run safety)
            const existing = await prisma.reviewPhoto.findFirst({
              where: { reviewId: review.id, r2Key: key },
            });
            if (!existing) {
              await prisma.reviewPhoto.create({
                data: { reviewId: review.id, r2Key: key, url },
              });
            }
            console.log(`  ✓ img[${i}] → ${url}`);
          } catch (imgErr) {
            console.warn(`  ✗ img[${i}] failed: ${imgErr}`);
          }
        }

        console.log(`  ✓ review.id = ${review.id}`);
      }
      imported++;
    } catch (err) {
      console.error(`  ✗ ${err}`);
      errors++;
    }
  }

  console.log(`\n${"─".repeat(50)}`);
  console.log(`Imported : ${imported}`);
  console.log(`Skipped  : ${skipped}`);
  console.log(`Errors   : ${errors}`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
