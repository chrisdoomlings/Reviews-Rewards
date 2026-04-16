/**
 * OTC (One-Time Code) authentication + Multipass session layer.
 *
 * Flow:
 *  1. Customer enters email → requestOtc() → 4-digit code sent via Resend
 *  2. Customer enters code  → verifyOtc()  → returns customer data + optional Multipass URL
 *  3. On Shopify Plus       → redirect to multipassUrl → customer logged into Shopify account
 *  4. On dev store          → customerId stored in widget sessionStorage (bypass mode)
 *
 * Silent re-auth:
 *  - Widget stores { customerId, email } in localStorage after first OTC verification
 *  - On return visit: widget sends customerId + IP to /api/auth/silent
 *  - Server checks: is there a verified LoginSession for this customer + IP within silentReauthDays?
 *  - If yes → skip OTC, load loyalty data directly
 */

import crypto from "crypto";
import { Resend } from "resend";
import prisma from "./db.server";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL  = process.env.RESEND_FROM_EMAIL ?? "noreply@doomlings.com";
const OTC_TTL_MS  = 15 * 60 * 1000; // 15 minutes

// ─── OTC helpers ─────────────────────────────────────────────────────────────

function generateOtc(): string {
  // Cryptographically random 4-digit code (1000–9999)
  const buf = crypto.randomBytes(4);
  const num = (buf.readUInt32BE(0) % 9000) + 1000;
  return String(num);
}

// ─── Request OTC ─────────────────────────────────────────────────────────────

export interface RequestOtcInput {
  shop:      string;
  email:     string;
  ipAddress: string;
  userAgent: string;
}

export async function requestOtc(input: RequestOtcInput): Promise<{ sent: boolean }> {
  const { shop, email, ipAddress, userAgent } = input;

  // Look up customer — loyalty accounts are scoped to a shop
  const customer = await prisma.customer.findFirst({
    where: { shop, email: { equals: email.toLowerCase().trim(), mode: "insensitive" } },
  });

  // Generate OTC regardless of whether the customer exists (prevents email enumeration)
  const code      = generateOtc();
  const expiresAt = new Date(Date.now() + OTC_TTL_MS);

  // Only persist + send if the customer actually exists
  if (customer) {
    // Invalidate any previous unverified sessions for this email
    await prisma.loginSession.deleteMany({
      where: { email: email.toLowerCase().trim(), verifiedAt: null },
    });

    await prisma.loginSession.create({
      data: {
        customerId:   customer.id,
        email:        email.toLowerCase().trim(),
        otcCode:      code,
        otcExpiresAt: expiresAt,
        ipAddress,
        userAgent,
      },
    });

    await resend.emails.send({
      from:    `Doomlings <${FROM_EMAIL}>`,
      to:      email,
      subject: `Your Doomlings login code: ${code}`,
      html:    otcEmailHtml(code, customer.firstName ?? undefined),
    });
  }

  // Always return the same response — never reveal whether the email exists
  return { sent: true };
}

// ─── Verify OTC ──────────────────────────────────────────────────────────────

export interface VerifyOtcResult {
  success:      boolean;
  error?:       string;
  customerId?:  string;   // Shopify customer ID (numeric string)
  email?:       string;
  firstName?:   string | null;
  multipassUrl?: string;  // only set on Shopify Plus when MULTIPASS_SECRET is configured
}

export async function verifyOtc(
  shop:      string,
  email:     string,
  code:      string,
  ipAddress: string,
): Promise<VerifyOtcResult> {
  const normalizedEmail = email.toLowerCase().trim();

  const session = await prisma.loginSession.findFirst({
    where: {
      email:        normalizedEmail,
      otcCode:      code.trim(),
      verifiedAt:   null,
      otcExpiresAt: { gt: new Date() },
    },
    include: { customer: true },
  });

  if (!session) {
    return { success: false, error: "Invalid or expired code. Please request a new one." };
  }

  // Mark session as verified + record IP for silent re-auth
  await prisma.loginSession.update({
    where: { id: session.id },
    data:  { verifiedAt: new Date(), ipAddress },
  });

  const customer = session.customer;
  if (!customer) {
    // Session exists but no customer record — shouldn't happen, but handle gracefully
    return { success: false, error: "No loyalty account found for this email." };
  }

  // Generate Multipass URL if on Shopify Plus (MULTIPASS_SECRET set)
  const multipassUrl = process.env.MULTIPASS_SECRET
    ? generateMultipassUrl({ email: customer.email }, process.env.MULTIPASS_SECRET, shop)
    : undefined;

  return {
    success:     true,
    customerId:  customer.shopifyCustomerId,
    email:       customer.email,
    firstName:   customer.firstName,
    multipassUrl,
  };
}

// ─── Silent re-auth check ─────────────────────────────────────────────────────

export async function canSilentReauth(
  shopifyCustomerId: string,
  ipAddress:         string,
  silentReauthDays:  number,
): Promise<boolean> {
  const customer = await prisma.customer.findUnique({ where: { shopifyCustomerId } });
  if (!customer) return false;

  const cutoff = new Date(Date.now() - silentReauthDays * 24 * 60 * 60 * 1000);

  const session = await prisma.loginSession.findFirst({
    where: {
      customerId: customer.id,
      ipAddress,
      verifiedAt: { not: null, gt: cutoff },
    },
  });

  return !!session;
}

// ─── Multipass token generation (Shopify Plus only) ──────────────────────────

function generateMultipassUrl(
  customerData: { email: string; [k: string]: string },
  secret:       string,
  shop:         string,
): string {
  // Shopify Multipass algorithm: https://shopify.dev/docs/api/multipass
  const key       = crypto.createHash("sha256").update(secret).digest();
  const encKey    = key.subarray(0, 16);
  const sigKey    = key.subarray(16);

  const iv         = crypto.randomBytes(16);
  const cipher     = crypto.createCipheriv("aes-128-cbc", encKey, iv);
  const payload    = JSON.stringify({ ...customerData, created_at: new Date().toISOString() });
  const ciphertext = Buffer.concat([iv, cipher.update(payload, "utf8"), cipher.final()]);

  const sig   = crypto.createHmac("sha256", sigKey).update(ciphertext).digest();
  const token = Buffer.concat([ciphertext, sig])
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `https://${shop}/account/login/multipass/${token}`;
}

// ─── OTC email template ───────────────────────────────────────────────────────

function otcEmailHtml(code: string, firstName?: string): string {
  const greeting = firstName ? `Hi ${firstName},` : "Hi there,";
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f6f7;font-family:sans-serif">
  <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">
    <div style="background:#c41b1b;padding:24px 32px">
      <div style="color:#fff;font-size:22px;font-weight:800;letter-spacing:.02em">Doomlings</div>
    </div>
    <div style="padding:32px">
      <p style="margin:0 0 8px;font-size:16px;color:#202223">${greeting}</p>
      <p style="margin:0 0 24px;font-size:14px;color:#5c5f62">
        Here is your one-time login code for your Doomlings rewards account:
      </p>
      <div style="text-align:center;padding:24px;background:#f6f6f7;border-radius:10px;margin-bottom:24px">
        <div style="font-size:48px;font-weight:800;letter-spacing:12px;color:#c41b1b;line-height:1">${code}</div>
        <div style="margin-top:10px;font-size:12px;color:#6b7280">Expires in 15 minutes</div>
      </div>
      <p style="margin:0;font-size:13px;color:#9ca3af">
        If you didn't request this code, you can safely ignore this email.
      </p>
    </div>
  </div>
</body>
</html>`;
}
