import { supabase } from "./supabase";

/**
 * Fire moderation on a freshly-uploaded photo. Skips entirely for
 * seed users (preserves Cloud Vision credits + AC-SD-06). Fire-and-forget
 * from the caller's perspective — no UX block on the result.
 *
 * If the verdict comes back 'flagged', the edge function will already have
 * removed the path from the appropriate parent record (profile.photos for
 * profile-photos, activities.photo_url for activity-photos), so on the
 * next refresh the user's UI will reflect the deletion.
 */
export async function moderatePhoto(
  path: string,
  isSeed: boolean,
  bucket: "profile-photos" | "activity-photos" = "profile-photos"
): Promise<void> {
  if (isSeed) return;
  try {
    const { error } = await supabase.functions.invoke("moderate-photo", {
      body: { path, bucket },
    });
    if (error) {
      console.warn("moderate-photo invoke error:", error.message);
    }
  } catch (e) {
    console.warn("moderate-photo invoke exception:", e);
  }
}

/**
 * Upload a user-picked image to the activity-photos bucket. Returns the
 * full public-style URL via createSignedUrl so the caller can store it
 * directly in activities.photo_url.
 *
 * Path convention: <user_id>/<timestamp>.<ext>
 */
export async function uploadActivityPhoto(
  uri: string,
  userId: string
): Promise<{ path: string; url: string }> {
  const response = await fetch(uri);
  const blob = await response.blob();
  const ext = (uri.split(".").pop()?.split("?")[0] || "jpg").toLowerCase();
  const path = `${userId}/${Date.now()}.${ext}`;
  const arrayBuffer = await new Response(blob).arrayBuffer();

  const { error } = await supabase.storage
    .from("activity-photos")
    .upload(path, arrayBuffer, {
      contentType: blob.type || "image/jpeg",
      upsert: false,
    });
  if (error) throw error;

  // Generate a long-lived signed URL (1 year). The bucket is private, so
  // signed URLs are required for cross-user reads. We refresh on RPC reads
  // if needed in the future, but for now bake this into activities.photo_url.
  const { data: signed, error: signErr } = await supabase.storage
    .from("activity-photos")
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  if (signErr || !signed) throw signErr ?? new Error("signed URL failed");

  return { path, url: signed.signedUrl };
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
