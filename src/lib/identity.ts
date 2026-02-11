// ============================================================
// Anonymous User Identity via localStorage
// Generates a persistent pseudo-ID per device/browser.
// ============================================================

const STORAGE_KEY = "sg_user_pseudo_id";

/**
 * Returns true if this browser has never visited before.
 * MUST be called BEFORE getUserId() on initial load,
 * because getUserId() creates the ID if missing.
 */
export function isFirstVisit(): boolean {
  if (typeof window === "undefined") return false;
  return !localStorage.getItem(STORAGE_KEY);
}

/**
 * Get or create the persistent user pseudo ID.
 * Stored in localStorage — survives page reloads.
 */
export function getUserId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}
