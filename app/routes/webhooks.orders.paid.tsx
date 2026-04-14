import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { awardPointsForOrder } from "../loyalty.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`[webhook] ${topic} for ${shop}`);

  // payload is the raw Shopify order object
  const order = payload as {
    id: number;
    total_price: string;
    customer?: {
      id: number;
      email: string;
      first_name?: string;
      last_name?: string;
    };
  };

  // Orders without a customer (guest checkouts) don't earn points.
  if (!order.customer?.id) {
    return new Response(null, { status: 200 });
  }

  const orderTotal = parseFloat(order.total_price);
  if (isNaN(orderTotal) || orderTotal <= 0) {
    return new Response(null, { status: 200 });
  }

  const result = await awardPointsForOrder({
    shop,
    shopifyOrderId: String(order.id),
    shopifyCustomerId: String(order.customer.id),
    email: order.customer.email,
    firstName: order.customer.first_name,
    lastName: order.customer.last_name,
    orderTotalUsd: orderTotal,
  });

  if (result.alreadyProcessed) {
    console.log(`[loyalty] order ${order.id} already processed — skipping`);
  } else {
    console.log(
      `[loyalty] awarded ${result.pointsAwarded} pts to customer ${order.customer.id} ` +
      `(new balance: ${result.newBalance}, tier: ${result.tier})`,
    );
  }

  return new Response(null, { status: 200 });
};
