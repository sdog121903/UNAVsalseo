"use client";

import { useEffect } from "react";
import { isFirstVisit, getUserId } from "@/lib/identity";
import { trackEvent } from "@/lib/analytics";

const SESSION_KEY = "sg_last_session_ts";
const SESSION_GAP_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Wrap the app with this provider.
 * On mount it fires:
 *   - first_visit  (once ever per device)
 *   - session_start (max 1 per 30 minutes)
 *   - qr_scan       (if URL contains ?source=qr)
 */
export default function AnalyticsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    // 1. First visit detection (MUST run before getUserId creates the ID)
    const isNew = isFirstVisit();
    getUserId(); // ensure ID exists from this point forward

    if (isNew) {
      trackEvent("first_visit");
    }

    // 2. Session start — throttled to 1 per 30 min
    const now = Date.now();
    const lastSession = localStorage.getItem(SESSION_KEY);
    if (!lastSession || now - parseInt(lastSession, 10) > SESSION_GAP_MS) {
      localStorage.setItem(SESSION_KEY, now.toString());
      trackEvent("session_start");
    }

    // 3. QR scan detection via query param
    const params = new URLSearchParams(window.location.search);
    if (params.get("source") === "qr") {
      trackEvent("qr_scan");
    }
  }, []);

  return <>{children}</>;
}
