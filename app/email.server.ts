/**
 * email.server.ts
 * Resend integration — schedule emails via Resend's scheduledAt API.
 * No cron or DB queue needed; Resend handles the delay.
 */

import { Resend } from "resend";
import prisma from "./db.server";

const resend  = new Resend(process.env.RESEND_API_KEY);
const FROM    = process.env.RESEND_FROM ?? "Doomlings <noreply@doomlings.com>";

// ─── Types ────────────────────────────────────────────────────────────────────

export type EmailType =
  | "review_request"
  | "review_reminder"
  | "tier_upgrade"
  | "points_expiry";

export interface ReviewRequestPayload {
  email:        string;
  firstName:    string;
  productTitle: string;
  productId:    string;
  orderId:      string;
  shop:         string;
  pointsReward: number;
}

export interface ReviewReminderPayload {
  email:        string;
  firstName:    string;
  productTitle: string;
  productId:    string;
  orderId:      string;
  shop:         string;
  pointsReward: number;
}

export interface TierUpgradePayload {
  email:     string;
  firstName: string;
  newTier:   string;
  points:    number;
  shop:      string;
}

export interface PointsExpiryPayload {
  email:     string;
  firstName: string;
  points:    number;
  expiresAt: string; // ISO date
  shop:      string;
}

type EmailPayload =
  | ReviewRequestPayload
  | ReviewReminderPayload
  | TierUpgradePayload
  | PointsExpiryPayload;

// ─── Schedule ─────────────────────────────────────────────────────────────────
// Sends to Resend with scheduledAt, then stores the Resend ID for cancellation.

export async function scheduleEmail(opts: {
  shop:         string;
  type:         EmailType;
  customerId?:  string;
  scheduledFor: Date;
  payload:      EmailPayload;
}) {
  const { to, subject, html } = buildEmailContent(opts.type, opts.payload);

  const { data, error } = await resend.emails.send({
    from:        FROM,
    to,
    subject,
    html,
    scheduledAt: opts.scheduledFor.toISOString(),
  });

  if (error || !data?.id) {
    throw new Error(`Resend schedule failed: ${JSON.stringify(error)}`);
  }

  return prisma.emailJob.create({
    data: {
      shop:         opts.shop,
      type:         opts.type,
      customerId:   opts.customerId ?? null,
      scheduledFor: opts.scheduledFor,
      status:       "scheduled",
      resendId:     data.id,
      payload:      opts.payload as object,
    },
  });
}

// ─── Send immediately ─────────────────────────────────────────────────────────
// For tier upgrades, points expiry alerts, etc. — no delay needed.

export async function sendEmailNow(opts: {
  shop:        string;
  type:        EmailType;
  customerId?: string;
  payload:     EmailPayload;
}) {
  const { to, subject, html } = buildEmailContent(opts.type, opts.payload);

  const { data, error } = await resend.emails.send({ from: FROM, to, subject, html });

  if (error || !data?.id) {
    throw new Error(`Resend send failed: ${JSON.stringify(error)}`);
  }

  return prisma.emailJob.create({
    data: {
      shop:         opts.shop,
      type:         opts.type,
      customerId:   opts.customerId ?? null,
      scheduledFor: new Date(),
      status:       "sent",
      sentAt:       new Date(),
      resendId:     data.id,
      payload:      opts.payload as object,
    },
  });
}

// ─── Cancel ───────────────────────────────────────────────────────────────────
// Called when a customer submits a review — cancels the pending reminder.

export async function cancelReviewEmailsForOrder(shop: string, orderId: string) {
  const jobs = await prisma.emailJob.findMany({
    where: {
      shop,
      status:  "scheduled",
      type:    { in: ["review_request", "review_reminder"] },
      payload: { path: ["orderId"], equals: orderId },
    },
    select: { id: true, resendId: true },
  });

  await Promise.all(
    jobs.map(async (job) => {
      if (job.resendId) {
        try {
          await resend.emails.cancel(job.resendId);
        } catch {
          // already sent or expired — ignore
        }
      }
      await prisma.emailJob.update({
        where: { id: job.id },
        data:  { status: "cancelled" },
      });
    })
  );
}

// ─── Content builders ─────────────────────────────────────────────────────────

function buildEmailContent(
  type: EmailType,
  payload: EmailPayload
): { to: string; subject: string; html: string } {
  switch (type) {
    case "review_request":  return buildReviewRequest(payload as ReviewRequestPayload);
    case "review_reminder": return buildReviewReminder(payload as ReviewReminderPayload);
    case "tier_upgrade":    return buildTierUpgrade(payload as TierUpgradePayload);
    case "points_expiry":   return buildPointsExpiry(payload as PointsExpiryPayload);
    default: throw new Error(`Unknown email type: ${type}`);
  }
}

function buildReviewRequest(p: ReviewRequestPayload) {
  const storeUrl   = `https://${p.shop}`;
  const reviewBase = `${storeUrl}/products/${p.productId}`;

  const starButtons = [1, 2, 3, 4, 5].map((n) => {
    const url   = `${reviewBase}?rating=${n}&order_id=${p.orderId}#review-widget`;
    const stars = "★".repeat(n) + "☆".repeat(5 - n);
    const color = n >= 4 ? "#15803d" : n === 3 ? "#ca8a04" : "#b91c1c";
    return `<a href="${url}" style="display:inline-block;margin:0 4px;padding:10px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-size:22px;color:${color};text-decoration:none;line-height:1">${stars}</a>`;
  }).join("");

  const html = baseTemplate({
    previewText: `How was ${p.productTitle}? Leave a review and earn ${p.pointsReward} DOOM Points`,
    body: `
      <p style="margin:0 0 8px;font-size:16px;color:#374151">Hi ${p.firstName || "there"},</p>
      <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6">
        Thanks for your recent order! We'd love to know what you think of <strong>${p.productTitle}</strong>.
      </p>
      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:16px 20px;margin-bottom:28px;text-align:center">
        <div style="font-size:13px;font-weight:700;color:#c2410c;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Leave a review, earn points</div>
        <div style="font-size:24px;font-weight:800;color:#c2410c">+${p.pointsReward} DOOM Points</div>
      </div>
      <p style="text-align:center;margin:0 0 12px;font-size:14px;color:#6b7280;font-weight:600">How would you rate it?</p>
      <div style="text-align:center;margin-bottom:28px">${starButtons}</div>
      <div style="text-align:center">
        <a href="${reviewBase}?order_id=${p.orderId}#review-widget"
          style="display:inline-block;padding:13px 28px;background:#c41b1b;color:#fff;border-radius:8px;font-size:15px;font-weight:700;text-decoration:none">
          Write a review
        </a>
      </div>
    `,
  });

  return {
    to:      p.email,
    subject: `How was ${p.productTitle}? Earn ${p.pointsReward} DOOM Points`,
    html,
  };
}

function buildReviewReminder(p: ReviewReminderPayload) {
  const storeUrl  = `https://${p.shop}`;
  const reviewUrl = `${storeUrl}/products/${p.productId}?order_id=${p.orderId}&reminder=1#review-widget`;

  const html = baseTemplate({
    previewText: `Still time to review ${p.productTitle} and earn ${p.pointsReward} DOOM Points`,
    body: `
      <p style="margin:0 0 8px;font-size:16px;color:#374151">Hi ${p.firstName || "there"},</p>
      <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6">
        Just a quick reminder — your review of <strong>${p.productTitle}</strong> is still waiting.
        It only takes a minute and you'll earn <strong>${p.pointsReward} DOOM Points</strong> when it's approved.
      </p>
      <div style="text-align:center">
        <a href="${reviewUrl}"
          style="display:inline-block;padding:13px 28px;background:#c41b1b;color:#fff;border-radius:8px;font-size:15px;font-weight:700;text-decoration:none">
          Leave your review
        </a>
      </div>
    `,
  });

  return {
    to:      p.email,
    subject: `Reminder: review ${p.productTitle} for ${p.pointsReward} DOOM Points`,
    html,
  };
}

function buildTierUpgrade(p: TierUpgradePayload) {
  const storeUrl = `https://${p.shop}`;

  const html = baseTemplate({
    previewText: `You've reached ${p.newTier} — congratulations!`,
    body: `
      <p style="margin:0 0 8px;font-size:16px;color:#374151">Hi ${p.firstName || "there"},</p>
      <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6">Great news — you've just levelled up to</p>
      <div style="text-align:center;margin-bottom:28px">
        <div style="display:inline-block;padding:12px 28px;background:#c41b1b;color:#fff;border-radius:99px;font-size:20px;font-weight:800">${p.newTier}</div>
      </div>
      <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;text-align:center">
        You now have <strong>${p.points.toLocaleString()} DOOM Points</strong>. Visit the store to explore your new rewards.
      </p>
      <div style="text-align:center">
        <a href="${storeUrl}/pages/loyalty"
          style="display:inline-block;padding:13px 28px;background:#c41b1b;color:#fff;border-radius:8px;font-size:15px;font-weight:700;text-decoration:none">
          View my rewards
        </a>
      </div>
    `,
  });

  return { to: p.email, subject: `You've reached ${p.newTier}!`, html };
}

function buildPointsExpiry(p: PointsExpiryPayload) {
  const storeUrl   = `https://${p.shop}`;
  const expiryDate = new Date(p.expiresAt).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });

  const html = baseTemplate({
    previewText: `Your ${p.points.toLocaleString()} DOOM Points expire on ${expiryDate}`,
    body: `
      <p style="margin:0 0 8px;font-size:16px;color:#374151">Hi ${p.firstName || "there"},</p>
      <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6">
        Your <strong>${p.points.toLocaleString()} DOOM Points</strong> are expiring on <strong>${expiryDate}</strong>. Use them before they're gone!
      </p>
      <div style="text-align:center">
        <a href="${storeUrl}/pages/loyalty"
          style="display:inline-block;padding:13px 28px;background:#c41b1b;color:#fff;border-radius:8px;font-size:15px;font-weight:700;text-decoration:none">
          Redeem my points
        </a>
      </div>
    `,
  });

  return {
    to:      p.email,
    subject: `Your ${p.points.toLocaleString()} DOOM Points expire ${expiryDate}`,
    html,
  };
}

// ─── Base template ────────────────────────────────────────────────────────────

function baseTemplate({ previewText, body }: { previewText: string; body: string }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Doomlings</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${previewText}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
        <tr>
          <td style="background:#c41b1b;border-radius:12px 12px 0 0;padding:24px 32px;text-align:center">
            <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:.02em">DOOMLINGS</div>
            <div style="font-size:12px;color:rgba(255,255,255,.75);margin-top:2px;font-weight:600;text-transform:uppercase;letter-spacing:.08em">Ends with Benefits</div>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;padding:32px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none">
            ${body}
            <hr style="margin:32px 0 24px;border:none;border-top:1px solid #f3f4f6">
            <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.6;text-align:center">
              You're receiving this because you made a purchase at
              <a href="https://doomlings.com" style="color:#9ca3af">doomlings.com</a>.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
