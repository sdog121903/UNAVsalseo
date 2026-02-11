// ============================================================
// Event Tracking Layer
// Every tracked action goes through trackEvent(), which
// automatically attaches the user_pseudo_id.
// ============================================================

import { supabase } from "./supabase";
import { getUserId } from "./identity";

/**
 * Insert a row into analytics_events with the current user's pseudo ID.
 */
export async function trackEvent(
  eventName: string,
  options?: {
    postId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const userId = getUserId();

  const { error } = await supabase.from("analytics_events").insert({
    event_name: eventName,
    user_pseudo_id: userId,
    post_id: options?.postId ?? null,
    metadata: options?.metadata ?? {},
  });

  if (error) {
    console.error(`[analytics] Error tracking "${eventName}":`, error);
  }
}
