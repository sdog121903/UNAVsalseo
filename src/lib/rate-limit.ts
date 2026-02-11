// ============================================================
// Client-side rate limiting via localStorage
// Since there is no auth, this is per-device enforcement.
// ============================================================

const STORAGE_KEYS = {
  LIKES: "sg_likes",       // { [postId]: number }
  POSTS: "sg_post_times",  // number[] (timestamps)
  LAST_FETCH: "sg_last_fetch", // number (timestamp)
} as const;

// ----- Configuration -----
const LIKE_LIMIT_PER_POST = 5;
const POST_LIMIT = 3;
const POST_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const FETCH_COOLDOWN_MS = 3000; // 3 seconds

// ----- Helpers -----
function getJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function setJSON(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

// ============================================================
// LIKES — max 5 per post per device
// ============================================================

export function getLikesGiven(postId: string): number {
  const likes: Record<string, number> = getJSON(STORAGE_KEYS.LIKES, {});
  return likes[postId] ?? 0;
}

export function remainingLikes(postId: string): number {
  return Math.max(0, LIKE_LIMIT_PER_POST - getLikesGiven(postId));
}

export function canLikePost(postId: string): boolean {
  return getLikesGiven(postId) < LIKE_LIMIT_PER_POST;
}

/** Record a like. Returns true if allowed, false if at limit. */
export function recordLike(postId: string): boolean {
  if (!canLikePost(postId)) return false;
  const likes: Record<string, number> = getJSON(STORAGE_KEYS.LIKES, {});
  likes[postId] = (likes[postId] ?? 0) + 1;
  setJSON(STORAGE_KEYS.LIKES, likes);
  return true;
}

// ============================================================
// POSTS — max 3 per 10-minute window
// ============================================================

function getRecentPostTimes(): number[] {
  const now = Date.now();
  const times: number[] = getJSON(STORAGE_KEYS.POSTS, []);
  // Only keep timestamps within the current window
  return times.filter((t) => now - t < POST_WINDOW_MS);
}

export function canPost(): { allowed: boolean; waitSeconds: number } {
  const recent = getRecentPostTimes();
  if (recent.length < POST_LIMIT) {
    return { allowed: true, waitSeconds: 0 };
  }
  // The oldest relevant timestamp determines when the window opens
  const oldest = Math.min(...recent);
  const waitMs = POST_WINDOW_MS - (Date.now() - oldest);
  return { allowed: false, waitSeconds: Math.ceil(waitMs / 1000) };
}

export function recordPost(): void {
  const recent = getRecentPostTimes();
  recent.push(Date.now());
  setJSON(STORAGE_KEYS.POSTS, recent);
}

export function postsRemaining(): number {
  return Math.max(0, POST_LIMIT - getRecentPostTimes().length);
}

// ============================================================
// FETCH THROTTLE — 3-second cooldown on refresh
// ============================================================

export function canFetch(): boolean {
  const last: number = getJSON(STORAGE_KEYS.LAST_FETCH, 0);
  return Date.now() - last >= FETCH_COOLDOWN_MS;
}

export function recordFetch(): void {
  setJSON(STORAGE_KEYS.LAST_FETCH, Date.now());
}
