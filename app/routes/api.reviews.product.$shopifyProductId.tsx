/**
 * GET /api/reviews/product/:shopifyProductId?shop=&page=&limit=
 *
 * Public endpoint for the storefront reviews widget.
 * Returns approved reviews for a product with aggregate star stats.
 */

import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { corsJson, corsPreflight } from "../cors.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") return corsPreflight();

  const { shopifyProductId } = params;
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") ?? "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(25, Math.max(1, parseInt(url.searchParams.get("limit") ?? "10", 10)));

  if (!shopifyProductId || !shop) {
    return corsJson({ error: "Missing required parameters" }, { status: 400 });
  }

  const where = { shop, shopifyProductId, status: "approved" } as const;

  const [reviews, total, ratingAgg, ratingDistRows] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        customer: { select: { firstName: true, lastName: true } },
        photos: { select: { id: true, url: true } },
        videos: {
          select: { id: true, status: true, durationSecs: true, r2KeyProcessed: true, r2KeyRaw: true },
        },
      },
    }),
    prisma.review.count({ where }),
    prisma.review.aggregate({ where, _avg: { rating: true } }),
    prisma.review.groupBy({
      by: ["rating"],
      where,
      _count: { id: true },
    }),
  ]);

  const r2Base = process.env.R2_PUBLIC_URL ?? "";

  const ratingDistribution: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  for (const row of ratingDistRows) {
    ratingDistribution[String(row.rating)] = row._count.id;
  }

  return corsJson(
    {
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        title: r.title,
        body: r.body,
        verifiedPurchase: r.verifiedPurchase,
        adminReply: r.adminReply,
        authorName: r.customer
          ? [r.customer.firstName, r.customer.lastName].filter(Boolean).join(" ") || "Customer"
          : "Anonymous",
        createdAt: r.createdAt.toISOString(),
        photos: r.photos.map((p) => ({ id: p.id, url: p.url })),
        videos: r.videos
          .filter((v) => v.status === "ready")
          .map((v) => ({
            id: v.id,
            durationSecs: v.durationSecs,
            url: r2Base ? `${r2Base}/${v.r2KeyProcessed ?? v.r2KeyRaw}` : null,
          })),
      })),
      total,
      page,
      limit,
      avgRating: ratingAgg._avg.rating ? Number(ratingAgg._avg.rating.toFixed(1)) : 0,
      ratingDistribution,
    },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
};
