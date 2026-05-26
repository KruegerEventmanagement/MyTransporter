import { supabase } from "@/integrations/supabase/client";

/**
 * Resolve a stored trip-photo reference into a viewable URL.
 * - Legacy rows stored the full public URL → returned as-is.
 * - New rows store the storage path → converted to a short-lived signed URL.
 */
export async function resolveTripPhotoUrl(stored: string): Promise<string> {
  if (!stored) return stored;
  if (/^https?:\/\//.test(stored)) return stored;
  const { data } = await supabase.storage
    .from("trip-photos")
    .createSignedUrl(stored, 60 * 60);
  return data?.signedUrl ?? "";
}

export async function resolveTripPhotoUrls(stored: string[]): Promise<string[]> {
  return Promise.all(stored.map(resolveTripPhotoUrl));
}
