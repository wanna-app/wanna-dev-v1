import { supabase } from "./supabase";

const SIGNED_URL_TTL_SEC = 60 * 60; // 1 hour
const cache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Resolve a Supabase Storage path (or full URL) to a signed URL with caching.
 * Returns the input unchanged if it's already a full http(s) URL.
 */
export async function resolveProfilePhotoUrl(
  pathOrUrl: string | null | undefined
): Promise<string | null> {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith("http")) return pathOrUrl;

  const cached = cache.get(pathOrUrl);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const { data, error } = await supabase.storage
    .from("profile-photos")
    .createSignedUrl(pathOrUrl, SIGNED_URL_TTL_SEC);

  if (error || !data) {
    console.warn("createSignedUrl error:", error?.message);
    return null;
  }

  cache.set(pathOrUrl, {
    url: data.signedUrl,
    expiresAt: Date.now() + (SIGNED_URL_TTL_SEC - 60) * 1000,
  });
  return data.signedUrl;
}
