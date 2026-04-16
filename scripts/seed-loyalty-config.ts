/**
 * Seed loyalty program configuration into ShopConfig + Reward tables.
 * Matches the "Ends with Benefits" program exactly as configured in Yotpo Loyalty.
 *
 * Usage:
 *   npx tsx scripts/seed-loyalty-config.ts
 *   npx tsx scripts/seed-loyalty-config.ts --dry-run
 */

import { readFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";

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

const DRY_RUN = process.argv.includes("--dry-run");
const SHOP    = process.env.SHOPIFY_SHOP ?? "doomlings.myshopify.com";
const prisma  = new PrismaClient();

// ─── Program configuration ────────────────────────────────────────────────────

// Must match the ShopConfigData interface in loyalty.server.ts exactly.
const SHOP_CONFIG = {
  pointsCurrencyName:      "points",
  expiryMonths:            12,
  expiryWarningDays:       30,
  launcherPromptsEnabled:  true,
  silentReauthDays:        30,

  // ── Tiers ─────────────────────────────────────────────────────────────────
  tiers: [
    {
      name: "prepper",  displayName: "Prepper",
      minPoints: 0,   earnMultiplier: 1.0,
      entryRewardPoints: 0,   birthdayRewardPoints: 0,
    },
    {
      name: "survivor", displayName: "Survivor",
      minPoints: 250, earnMultiplier: 1.25,
      entryRewardPoints: 50,  birthdayRewardPoints: 100,
    },
    {
      name: "ruler",    displayName: "Ruler",
      minPoints: 500, earnMultiplier: 1.5,
      entryRewardPoints: 100, birthdayRewardPoints: 150,
    },
  ],

  // ── Earning rules ──────────────────────────────────────────────────────────
  earningRules: {
    basePointsPerDollar:    1,
    purchaseEnabled:        true,
    textReviewEnabled:      true,
    textReviewPoints:       20,
    photoReviewPoints:      20,
    videoReviewEnabled:     true,
    videoReviewPoints:      25,
    createAccountPoints:    10,
    smsSignupPoints:        25,
    facebookSharePoints:    10,
    facebookGroupPoints:    10,
    instagramFollowPoints:  10,
    tiktokFollowPoints:     10,
    discordJoinPoints:      10,
    twitchFollowPoints:     10,
    birthdayPoints:         50,
    referralPoints:         200,
  },

  reviewSettings: {
    flagKeywords:      ["spam", "discount", "cheap", "external link"],
    lowStarThreshold:  2,
  },
};

// ─── Rewards catalog ──────────────────────────────────────────────────────────
// Cash back equivalent: 5% ($1 = 1 point → 100 points = $5)

const REWARDS = [
  { name: "$5 off",  pointsCost: 100, type: "discount_fixed", value: "5"  },
  { name: "$10 off", pointsCost: 200, type: "discount_fixed", value: "10" },
  { name: "$15 off", pointsCost: 300, type: "discount_fixed", value: "15" },
  { name: "$20 off", pointsCost: 400, type: "discount_fixed", value: "20" },
  { name: "$40 off", pointsCost: 800, type: "discount_fixed", value: "40" },
];

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nLoyalty config seeder`);
  console.log(`  Shop    : ${SHOP}`);
  console.log(`  Mode    : ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"}\n`);

  // ── ShopConfig ─────────────────────────────────────────────────────────────
  console.log("── ShopConfig ──────────────────────────────────────");
  console.log(`  Tiers   : ${SHOP_CONFIG.tiers.map(t => t.displayName).join(" → ")}`);
  console.log(`  Expiry  : 12 months rolling`);
  console.log(`  Earning : ${Object.keys(SHOP_CONFIG.earningRules).length} rules`);

  if (!DRY_RUN) {
    await prisma.shopConfig.upsert({
      where:  { shop: SHOP },
      create: { shop: SHOP, config: SHOP_CONFIG },
      update: { config: SHOP_CONFIG },
    });
    console.log(`  ✓ ShopConfig saved`);
  } else {
    console.log(`  [dry-run] would upsert ShopConfig`);
  }

  // ── Rewards ────────────────────────────────────────────────────────────────
  console.log(`\n── Rewards ─────────────────────────────────────────`);

  for (const reward of REWARDS) {
    console.log(`  ${reward.name.padEnd(10)} ${reward.pointsCost} points`);

    if (!DRY_RUN) {
      // Match by shop + name so re-running is safe
      const existing = await prisma.reward.findFirst({
        where: { shop: SHOP, name: reward.name },
      });

      if (existing) {
        await prisma.reward.update({
          where: { id: existing.id },
          data:  { pointsCost: reward.pointsCost, value: reward.value, isActive: true },
        });
        console.log(`    ✓ updated (id: ${existing.id})`);
      } else {
        const created = await prisma.reward.create({
          data: { shop: SHOP, ...reward },
        });
        console.log(`    ✓ created (id: ${created.id})`);
      }
    } else {
      console.log(`    [dry-run] would upsert reward`);
    }
  }

  console.log(`\n${"─".repeat(50)}`);
  console.log(`Done${DRY_RUN ? " (dry run — nothing written)" : ""}`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
