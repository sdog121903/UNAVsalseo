export interface Post {
  id: string;
  content: string;
  media_url: string | null;
  media_type: "image" | "video" | null;
  likes: number;
  created_at: string;
}

export interface Feedback {
  id: string;
  post_id: string | null;
  rating: "happy" | "normal" | "sad";
  created_at: string;
}

export interface AnalyticsEvent {
  id: string;
  event_name: string;
  user_pseudo_id: string | null;
  post_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}
