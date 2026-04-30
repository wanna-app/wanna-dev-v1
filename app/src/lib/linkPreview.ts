import { supabase } from "./supabase";

export interface LinkPreviewData {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  domain: string;
}

const URL_RE = /https?:\/\/[^\s<>"']+/i;

export function findFirstUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(URL_RE);
  if (!m) return null;
  // Strip trailing punctuation that looks attached
  return m[0].replace(/[.,;:)\]]+$/, "");
}

const cache = new Map<
  string,
  { data: LinkPreviewData; expiresAt: number }
>();
const inflight = new Map<string, Promise<LinkPreviewData | null>>();
const TTL_MS = 30 * 60 * 1000;

export async function fetchLinkPreview(
  url: string
): Promise<LinkPreviewData | null> {
  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const existing = inflight.get(url);
  if (existing) return existing;

  const p = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("link-preview", {
        body: { url },
      });
      if (error || !data) return null;
      const preview = data as LinkPreviewData;
      cache.set(url, { data: preview, expiresAt: Date.now() + TTL_MS });
      return preview;
    } catch (e) {
      console.warn("fetchLinkPreview error:", e);
      return null;
    } finally {
      inflight.delete(url);
    }
  })();
  inflight.set(url, p);
  return p;
}
