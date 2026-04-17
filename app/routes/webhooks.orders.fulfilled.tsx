import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { scheduleEmail } from "../email.server";
import { getShopConfig } from "../loyalty.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`[webhook] ${topic} for ${shop}`);

  const order = payload as {
    id: number;
    name: string;
    customer?: {
      id: number;
      email: string;
      first_name?: string;
    };
    line_items?: Array<{
      product_id: number | null;
      title: string;
      handle?: string;
    }>;
  };

  // Guest or no customer — skip
  if (!order.customer?.email) {
    return new Response(null, { status: 200 });
  }

  const orderId   = String(order.id);
  const email     = order.customer.email;
  const firstName = order.customer.first_name ?? "";

  // Pick the first reviewable line item (skip gift cards / null product_id)
  const item = order.line_items?.find((li) => li.product_id != null);
  if (!item) {
    return new Response(null, { status: 200 });
  }

  const productId    = String(item.product_id);
  const productTitle = item.title;

  // Check if this order already has a review request queued — idempotent
  const existing = await prisma.emailJob.findFirst({
    where: {
      shop,
      type:    "review_request",
      status:  { in: ["pending", "sent"] },
      payload: { path: ["orderId"], equals: orderId },
    },
  });
  if (existing) {
    return new Response(null, { status: 200 });
  }

  // Get points reward from shop config
  const config      = await getShopConfig(shop);
  const pointsReward = config.earningRules.textReviewPoints ?? 75;

  // Find the customer record if they're a loyalty member
  const customer = await prisma.customer.findFirst({
    where: { shop, email },
    select: { id: true },
  });

  const now         = new Date();
  const fiveDays    = new Date(now.getTime() + 5  * 24 * 60 * 60 * 1000);
  const twelveDays  = new Date(now.getTime() + 12 * 24 * 60 * 60 * 1000);

  const reviewPayload = {
    email, firstName, productTitle, productId, orderId, shop, pointsReward,
  };

  // Schedule review request (5 days) and reminder (12 days)
  await Promise.all([
    scheduleEmail({
      shop,
      type:         "review_request",
      customerId:   customer?.id,
      scheduledFor: fiveDays,
      payload:      reviewPayload,
    }),
    scheduleEmail({
      shop,
      type:         "review_reminder",
      customerId:   customer?.id,
      scheduledFor: twelveDays,
      payload:      { ...reviewPayload },
    }),
  ]);

  console.log(`[email] scheduled review request + reminder for order ${orderId}`);

  return new Response(null, { status: 200 });
};
