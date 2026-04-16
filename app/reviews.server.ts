import prisma from "./db.server";
import { awardPointsForReview } from "./loyalty.server";

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

export async function getReviewStats(shop: string) {
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
}

// ─── Star rating distribution ────────────────────────────────────────────────

export async function getRatingCounts(shop: string): Promise<Record<number, number>> {
  const rows = await prisma.review.groupBy({
    by: ["rating"],
    where: { shop },
    _count: true,
  });
  const out: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of rows) out[r.rating] = r._count;
  return out;
}

// ─── Paginated review list ────────────────────────────────────────────────────

const PAGE_SIZE = 25;

export async function getReviewsPage(
  shop: string,
  {
    status = "all",
    page = 1,
    search = "",
    rating,
    type,
  }: { status?: string; page?: number; search?: string; rating?: number; type?: string },
) {
  // Build where clause
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

  const where = conditions.length === 1 ? conditions[0] : { AND: conditions };

  const [rows, total] = await Promise.all([
    prisma.review.findMany({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      where: where as any,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        customer: { select: { email: true, firstName: true, lastName: true, shop: true } },
        photos: { select: { id: true, url: true } },
        videos: {
          select: { id: true, status: true, durationSecs: true, r2KeyRaw: true, r2KeyProcessed: true },
        },
      },
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma.review.count({ where: where as any }),
  ]);

  const r2Base = process.env.R2_PUBLIC_URL ?? "";

  return {
    reviews: rows.map((r): ReviewRow => ({
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
    page,
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
