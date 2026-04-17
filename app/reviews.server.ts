import { Prisma } from "@prisma/client";
import prisma from "./db.server";
import { awardPointsForReview } from "./loyalty.server";

// ─── Simple in-process cache for expensive aggregate queries ──────────────────
// Stats (pending count, flagged count, rating distribution) don't need to be
// exact on every request. A 30-second TTL eliminates the COUNT(*) overhead
// for the vast majority of page loads at scale.

interface CacheEntry<T> { value: T; expiresAt: number }
const cache = new Map<string, CacheEntry<unknown>>();

function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.expiresAt > Date.now()) return Promise.resolve(hit.value);
  return fn().then((value) => {
    cache.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  });
}

export function invalidateReviewCache(shop: string) {
  for (const key of cache.keys()) {
    if (key.startsWith(shop)) cache.delete(key);
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReviewRow {
  id: string;
  shopifyProductId: string;
  shopifyOrderId: string | null;
  rating: number;
  title: string | null;
  body: string | null;
  status: string;
  flagged: boolean;
  verifiedPurchase: boolean;
  adminReply: string | null;
  createdAt: string;
  customerId: string | null;
  customerShop: string | null;
  customer: { email: string; firstName: string | null; lastName: string | null } | null;
  reviewerName: string | null;
  photos: { id: string; url: string }[];
  videos: { id: string; status: string; durationSecs: number | null; url: string | null }[];
}

// ─── Stats ────────────────────────────────────────────────────────────────────
// Cached 30 s — COUNT(*) at 10M rows is expensive; pending/flagged counts
// don't need to be exact to the millisecond for a moderation dashboard.

export function getReviewStats(shop: string) {
  return cached(`${shop}:stats`, 30_000, async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [pending, flagged, approvedToday, ratingAgg] = await Promise.all([
      prisma.review.count({ where: { shop, status: "pending" } }),
      prisma.review.count({
        where: { shop, flagged: true, status: { notIn: ["approved", "rejected"] } },
      }),
      prisma.review.count({ where: { shop, status: "approved", updatedAt: { gte: today } } }),
      prisma.review.aggregate({
        where: { shop, status: "approved" },
        _avg: { rating: true },
      }),
    ]);

    return {
      pending,
      flagged,
      approvedToday,
      avgRating: ratingAgg._avg.rating ? Number(ratingAgg._avg.rating.toFixed(1)) : 0,
    };
  });
}

// ─── Star rating distribution ────────────────────────────────────────────────
// Cached 60 s — distribution barely changes between page loads.

export function getRatingCounts(shop: string): Promise<Record<number, number>> {
  return cached(`${shop}:ratingCounts`, 60_000, async () => {
    const rows = await prisma.review.groupBy({
      by: ["rating"],
      where: { shop },
      _count: true,
    });
    const out: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of rows) out[r.rating] = r._count;
    return out;
  });
}

// ─── Paginated review list ────────────────────────────────────────────────────
//
// Uses cursor-based (keyset) pagination instead of OFFSET.
// At 10 M rows, OFFSET n forces Postgres to scan & discard n rows before
// returning 25. With a cursor Postgres seeks directly to the right position
// via the covering index, making every page equally fast.
//
// Cursor = the `id` of the last row on the previous page (CUIDs sort stably
// within the same createdAt second because we add `id DESC` as a tiebreaker).

const PAGE_SIZE = 25;

function buildWhere(shop: string, opts: {
  status?: string; search?: string; rating?: number; type?: string;
}) {
  const { status = "all", search = "", rating, type } = opts;
  const conditions: object[] = [{ shop }];

  if (status === "flagged") {
    conditions.push({ flagged: true, status: { notIn: ["approved", "rejected"] } });
  } else if (status !== "all") {
    conditions.push({ status });
  }

  if (rating) conditions.push({ rating });

  if (type === "product") conditions.push({ shopifyProductId: { not: "site" } });
  else if (type === "site") conditions.push({ shopifyProductId: "site" });

  if (search) {
    conditions.push({
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        { body: { contains: search, mode: "insensitive" } },
        { reviewerName: { contains: search, mode: "insensitive" } },
      ],
    });
  }

  return conditions.length === 1 ? conditions[0] : { AND: conditions };
}

export async function getReviewsPage(
  shop: string,
  {
    status = "all",
    cursor,
    search = "",
    rating,
    type,
  }: { status?: string; cursor?: string; search?: string; rating?: number; type?: string },
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where = buildWhere(shop, { status, search, rating, type }) as any;

  const [rows, total] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      // Take one extra row to detect whether there's a next page.
      take: PAGE_SIZE + 1,
      // Cursor seek: skip the cursor row itself (it was the last item on the
      // previous page) and start from the row that follows it in sort order.
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        customer: { select: { email: true, firstName: true, lastName: true, shop: true } },
        photos: { select: { id: true, url: true } },
        videos: {
          select: { id: true, status: true, durationSecs: true, r2KeyRaw: true, r2KeyProcessed: true },
        },
      },
    }),
    prisma.review.count({ where }),
  ]);

  const hasMore = rows.length > PAGE_SIZE;
  const items   = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  const r2Base = process.env.R2_PUBLIC_URL ?? "";

  return {
    reviews: items.map((r): ReviewRow => ({
      id: r.id,
      shopifyProductId: r.shopifyProductId,
      shopifyOrderId: r.shopifyOrderId,
      rating: r.rating,
      title: r.title,
      body: r.body,
      status: r.status,
      flagged: r.flagged,
      verifiedPurchase: r.verifiedPurchase,
      adminReply: r.adminReply,
      createdAt: r.createdAt.toISOString(),
      customerId: r.customerId,
      customerShop: r.customer?.shop ?? null,
      customer: r.customer
        ? { email: r.customer.email, firstName: r.customer.firstName, lastName: r.customer.lastName }
        : null,
      reviewerName: r.reviewerName,
      photos: r.photos.map((p) => ({ id: p.id, url: p.url })),
      videos: r.videos.map((v) => ({
        id: v.id,
        status: v.status,
        durationSecs: v.durationSecs,
        url: r2Base ? `${r2Base}/${v.r2KeyProcessed ?? v.r2KeyRaw}` : null,
      })),
    })),
    total,
    nextCursor,
    hasMore,
    pageSize: PAGE_SIZE,
  };
}

// ─── Moderation actions ───────────────────────────────────────────────────────

export async function approveReview(reviewId: string, shop: string): Promise<void> {
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    include: {
      videos: { where: { status: { not: "failed" } }, take: 1 },
      photos: { take: 1 },
    },
  });
  if (!review || review.status === "approved") return; // idempotency

  await prisma.review.update({ where: { id: reviewId }, data: { status: "approved" } });

  // Mark pending videos as ready so the storefront widget can display them.
  // Raw upload is served directly until a transcoding worker sets r2KeyProcessed.
  if (review.videos.length > 0) {
    await prisma.reviewVideo.updateMany({
      where: { reviewId, status: "pending" },
      data: { status: "ready" },
    });
  }

  if (review.customerId) {
    const reviewType = review.videos.length > 0 ? "video"
      : review.photos.length > 0 ? "photo"
      : "text";
    await awardPointsForReview(review.customerId, shop, reviewType);
  }
}

export async function rejectReview(reviewId: string): Promise<void> {
  await prisma.review.update({ where: { id: reviewId }, data: { status: "rejected" } });
}

export async function setAdminReply(reviewId: string, reply: string): Promise<void> {
  await prisma.review.update({
    where: { id: reviewId },
    data: { adminReply: reply.trim(), adminReplyAt: new Date() },
  });
}

export async function rejectVideo(videoId: string): Promise<void> {
  await prisma.reviewVideo.update({ where: { id: videoId }, data: { status: "failed" } });
}

export async function flagReview(reviewId: string): Promise<void> {
  await prisma.review.update({ where: { id: reviewId }, data: { flagged: true } });
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export async function getProductsWithReviews(shop: string) {
  const rows = await prisma.review.groupBy({
    by: ["shopifyProductId"],
    where: { shop, shopifyProductId: { not: "site" } },
    _count: true,
    orderBy: { _count: { shopifyProductId: "desc" } },
    take: 200,
  });
  return rows.map((r) => ({ productId: r.shopifyProductId, count: r._count }));
}

export async function getAnalytics(
  shop: string,
  { days = 30, type = "all", productId }: { days?: number; type?: string; productId?: string },
) {
  const now      = new Date();
  const from     = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const prevFrom = new Date(from.getTime() - days * 24 * 60 * 60 * 1000);

  const typeFilter =
    type === "product" ? { shopifyProductId: { not: "site" } } :
    type === "site"    ? { shopifyProductId: "site" } :
    {};

  const productFilter = productId ? { shopifyProductId: productId } : {};

  const base     = { shop, ...typeFilter, ...productFilter };
  const basePrev = { ...base, createdAt: { gte: prevFrom, lt: from } };
  const baseCur  = { ...base, createdAt: { gte: from } };

  const typeClause =
    type === "product" ? Prisma.sql`AND "shopifyProductId" != 'site'` :
    type === "site"    ? Prisma.sql`AND "shopifyProductId" = 'site'` :
    Prisma.sql``;

  const productClause = productId
    ? Prisma.sql`AND "shopifyProductId" = ${productId}`
    : Prisma.sql``;

  const [
    totalReviews,
    avgAgg,
    newInPeriod,
    newInPrev,
    ratingRows,
    statusRows,
    timeSeries,
  ] = await Promise.all([
    prisma.review.count({ where: base }),
    prisma.review.aggregate({ where: { ...base, status: "approved" }, _avg: { rating: true } }),
    prisma.review.count({ where: baseCur }),
    prisma.review.count({ where: basePrev }),
    prisma.review.groupBy({ by: ["rating"], where: base, _count: true }),
    prisma.review.groupBy({ by: ["status"], where: base, _count: true }),
    prisma.$queryRaw<{ day: string; count: number }[]>`
      SELECT TO_CHAR(DATE_TRUNC('day', "createdAt"), 'YYYY-MM-DD') as day,
             COUNT(*)::int as count
      FROM "Review"
      WHERE shop = ${shop} AND "createdAt" >= ${from}
      ${typeClause}
      ${productClause}
      GROUP BY day ORDER BY day ASC
    `,
  ]);

  const avgRating  = avgAgg._avg.rating ? Number(avgAgg._avg.rating.toFixed(1)) : 0;
  const periodPct  = newInPrev > 0
    ? Math.round(((newInPeriod - newInPrev) / newInPrev) * 100)
    : newInPeriod > 0 ? 100 : 0;

  const ratingDist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of ratingRows) ratingDist[r.rating] = r._count;

  const statusDist: Record<string, number> = { approved: 0, pending: 0, rejected: 0, flagged: 0 };
  for (const r of statusRows) statusDist[r.status] = r._count;

  return {
    totalReviews,
    avgRating,
    newInPeriod,
    periodPct,
    ratingDist,
    statusDist,
    timeSeries: timeSeries.map((r) => ({ day: r.day, count: Number(r.count) })),
  };
}
