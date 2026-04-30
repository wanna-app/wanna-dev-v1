import { supabase } from "./supabase";

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
