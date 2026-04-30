import { supabase } from "./supabase";

/**
 * Fire moderation on a freshly-uploaded profile photo. Skips entirely for
 * seed users (preserves Cloud Vision credits + AC-SD-06). Fire-and-forget
 * from the caller's perspective — no UX block on the result.
 *
 * If the verdict comes back 'flagged', the edge function will already have
 * removed the path from profile.photos, so on the next refreshProfile()
 * the user's UI will reflect the deletion.
 */
export async function moderatePhoto(
  path: string,
  isSeed: boolean
): Promise<void> {
  if (isSeed) return;
  try {
    const { error } = await supabase.functions.invoke("moderate-photo", {
      body: { path },
    });
    if (error) {
      console.warn("moderate-photo invoke error:", error.message);
    }
  } catch (e) {
    console.warn("moderate-photo invoke exception:", e);
  }
}

export async function uploadProfilePhoto(
  uri: string,
  userId: string,
  index: number
): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  const ext = (uri.split(".").pop()?.split("?")[0] || "jpg").toLowerCase();
  const path = `${userId}/${Date.now()}_${index}.${ext}`;
  const arrayBuffer = await new Response(blob).arrayBuffer();

  const { error } = await supabase.storage
    .from("profile-photos")
    .upload(path, arrayBuffer, {
      contentType: blob.type || "image/jpeg",
      upsert: false,
    });
  if (error) throw error;
  return path;
}

export async function uploadVerificationSelfie(
  uri: string,
  userId: string
): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  const path = `${userId}/${Date.now()}_verification.jpg`;
  const arrayBuffer = await new Response(blob).arrayBuffer();

  const { error } = await supabase.storage
    .from("verification-selfies")
    .upload(path, arrayBuffer, {
      contentType: "image/jpeg",
      upsert: false,
    });
  if (error) throw error;
  return path;
}
