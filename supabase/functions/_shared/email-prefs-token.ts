// Shared HS256-signed token for the email-prefs hosted page.
//
// Tokens are embedded into welcome-email footer links. They carry just
// enough info to identify the user and what they're trying to do
// (manage preferences vs one-click unsubscribe), with a 30-day TTL.
//
// Both `send-email` (issuer) and `email-prefs` (verifier) import from
// this module — keep them in lockstep.

import {
  create as jwtCreate,
  verify as jwtVerify,
} from "https://deno.land/x/djwt@v3.0.2/mod.ts";

export type EmailPrefsTokenType = "manage" | "unsubscribe";

export interface EmailPrefsTokenPayload {
  uid: string;
  type: EmailPrefsTokenType;
  iat: number;
  exp: number;
  // djwt allows arbitrary additional claims
  [key: string]: unknown;
}

const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

async function importKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signEmailPrefsToken(
  secret: string,
  uid: string,
  type: EmailPrefsTokenType,
): Promise<string> {
  const key = await importKey(secret);
  const now = Math.floor(Date.now() / 1000);
  const payload: EmailPrefsTokenPayload = {
    uid,
    type,
    iat: now,
    exp: now + TTL_SECONDS,
  };
  return await jwtCreate({ alg: "HS256", typ: "JWT" }, payload, key);
}

export async function verifyEmailPrefsToken(
  secret: string,
  token: string,
): Promise<EmailPrefsTokenPayload | null> {
  try {
    const key = await importKey(secret);
    const payload = (await jwtVerify(token, key)) as EmailPrefsTokenPayload;
    if (
      typeof payload.uid !== "string" ||
      (payload.type !== "manage" && payload.type !== "unsubscribe")
    ) {
      return null;
    }
    return payload;
  } catch {
    // djwt throws on signature mismatch, expired, or malformed — treat
    // all of those the same: invalid token.
    return null;
  }
}
