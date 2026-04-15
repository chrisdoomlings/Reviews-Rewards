import type { ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
import { getShopConfig } from "../loyalty.server";

export const loader = () => new Response("Method Not Allowed", { status: 405 });

interface SubmitReviewBody {
  shop: string;
  shopifyCustomerId?: string;
  shopifyProductId: string;
  shopifyVariantId?: string;
  shopifyOrderId?: string;
  rating: number;
  title?: string;
  body?: string;
  photoKeys?: string[];
  videoKey?: string;
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const raw = await request.json().catch(() => null);
  if (!raw) return Response.json({ error: "Invalid request body" }, { status: 400 });

  const {
    shop,
    shopifyCustomerId,
    shopifyProductId,
    shopifyVariantId,
    shopifyOrderId,
    rating,
    title,
    body: reviewBody,
    photoKeys,
    videoKey,
  } = raw as SubmitReviewBody;

  if (!shop || !shopifyProductId || typeof rating !== "number" || rating < 1 || rating > 5) {
    return Response.json({ error: "Missing or invalid required fields" }, { status: 400 });
  }

  // Resolve internal customer record
  let customerId: string | null = null;
  if (shopifyCustomerId) {
    const customer = await prisma.customer.findUnique({ where: { shopifyCustomerId } });
    if (customer) customerId = customer.id;
  }

  // Verified purchase: customer must have an earn transaction for this order
  let verifiedPurchase = false;
  if (shopifyOrderId && customerId) {
    const tx = await prisma.transaction.findFirst({
      where: { customerId, orderId: shopifyOrderId },
    });
    verifiedPurchase = !!tx;
  }

  // Auto-flag check
  const config = await getShopConfig(shop);
  let flagged = rating <= config.reviewSettings.lowStarThreshold;

  if (!flagged && (title || reviewBody)) {
    const text = `${title ?? ""} ${reviewBody ?? ""}`.toLowerCase();
    flagged = config.reviewSettings.flagKeywords.some((kw) =>
      text.includes(kw.toLowerCase()),
    );
  }

  // Create review
  const review = await prisma.review.create({
    data: {
      shop,
      customerId,
      shopifyOrderId,
      shopifyProductId,
      shopifyVariantId,
      rating,
      title,
      body: reviewBody,
      verifiedPurchase,
      flagged,
      status: "pending",
    },
  });

  // Attach photo records (max 5, must be from our uploads prefix)
  if (photoKeys && photoKeys.length > 0) {
    const valid = photoKeys.slice(0, 5).filter((k) => k.startsWith("uploads/photos/"));
    if (valid.length > 0) {
      await prisma.reviewPhoto.createMany({
        data: valid.map((k) => ({
          reviewId: review.id,
          r2Key: k,
          url: `${process.env.R2_PUBLIC_URL}/${k}`,
        })),
      });
    }
  }

  // Attach video record
  if (videoKey && videoKey.startsWith("uploads/videos/")) {
    await prisma.reviewVideo.create({
      data: { reviewId: review.id, r2KeyRaw: videoKey, status: "pending" },
    });
  }

  return Response.json({ reviewId: review.id, status: review.status }, { status: 201 });
}
