"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

// ============================================================
// Types
// ============================================================

interface RawEvent {
  id: string;
  event_name: string;
  user_pseudo_id: string | null;
  created_at: string;
}

interface RawFeedback {
  rating: string;
}

interface RawPost {
  likes: number;
}

interface Metrics {
  // Acquisition & Activation
  uniqueVisits: number;
  activationRate: number;
  activationGoalMet: boolean;
  totalQrScans: number;

  // Engagement
  dau: number;
  totalPosts: number;
  totalLikes: number;
  totalShares: number;
  engagementRate: number;
  avgSessionLengthMin: number;

  // Retention
  churnRate: number;
  day1Retention: number;

  // Virality & Satisfaction
  viralCoefficient: number;
  npsScore: number;
  npsThresholdMet: boolean;
  happyCount: number;
  normalCount: number;
  sadCount: number;
  totalFeedback: number;
}

const EMPTY_METRICS: Metrics = {
  uniqueVisits: 0,
  activationRate: 0,
  activationGoalMet: false,
  totalQrScans: 0,
  dau: 0,
  totalPosts: 0,
  totalLikes: 0,
  totalShares: 0,
  engagementRate: 0,
  avgSessionLengthMin: 0,
  churnRate: 0,
  day1Retention: 0,
  viralCoefficient: 0,
  npsScore: 0,
  npsThresholdMet: false,
  happyCount: 0,
  normalCount: 0,
  sadCount: 0,
  totalFeedback: 0,
};

// ============================================================
// Secret gate (simple URL-param protection)
// ============================================================
const ADMIN_SECRET = "tfg2026";

// ============================================================
// Calculation helpers
// ============================================================

function computeMetrics(
  events: RawEvent[],
  feedback: RawFeedback[],
  posts: RawPost[]
): Metrics {
  const now = Date.now();
  const MS_24H = 24 * 60 * 60 * 1000;
  const MS_48H = 48 * 60 * 60 * 1000;
  const MS_7D = 7 * 24 * 60 * 60 * 1000;
  const MS_8D = 8 * 24 * 60 * 60 * 1000;
  const SESSION_GAP = 30 * 60 * 1000;

  // --- Unique users ---
  const allUsers = new Set(
    events.map((e) => e.user_pseudo_id).filter(Boolean)
  );
  const uniqueVisits = allUsers.size;

  // --- Activation: users who created a post ---
  const activatedUsers = new Set(
    events
      .filter((e) => e.event_name === "post_created")
      .map((e) => e.user_pseudo_id)
      .filter(Boolean)
  );
  const activationRate =
    uniqueVisits > 0 ? (activatedUsers.size / uniqueVisits) * 100 : 0;

  // --- QR Scans ---
  const totalQrScans = events.filter(
    (e) => e.event_name === "qr_scan"
  ).length;

  // --- DAU: distinct users in last 24 h ---
  const dau = new Set(
    events
      .filter((e) => now - new Date(e.created_at).getTime() < MS_24H)
      .map((e) => e.user_pseudo_id)
      .filter(Boolean)
  ).size;

  // --- Engagement ---
  const totalPosts = posts.length;
  const totalLikes = posts.reduce((s, p) => s + (p.likes ?? 0), 0);
  const totalShares = events.filter(
    (e) => e.event_name === "share_post"
  ).length;
  const totalViews = events.filter((e) =>
    ["session_start", "first_visit"].includes(e.event_name)
  ).length;
  const engagementRate =
    totalViews > 0
      ? ((totalLikes + totalShares) / totalViews) * 100
      : 0;

  // --- Average session length ---
  // Group events by user, sort, split into sessions by 30-min gap
  const byUser: Record<string, number[]> = {};
  for (const e of events) {
    const uid = e.user_pseudo_id;
    if (!uid) continue;
    if (!byUser[uid]) byUser[uid] = [];
    byUser[uid].push(new Date(e.created_at).getTime());
  }

  let totalSessionMs = 0;
  let sessionCount = 0;

  for (const uid in byUser) {
    const times = byUser[uid].sort((a, b) => a - b);
    let sessionStart = times[0];
    let lastEvent = sessionStart;

    for (let i = 1; i < times.length; i++) {
      if (times[i] - lastEvent > SESSION_GAP) {
        // close previous session
        totalSessionMs += lastEvent - sessionStart;
        sessionCount++;
        sessionStart = times[i];
      }
      lastEvent = times[i];
    }
    // close last session
    totalSessionMs += lastEvent - sessionStart;
    sessionCount++;
  }
  const avgSessionLengthMin =
    sessionCount > 0 ? totalSessionMs / sessionCount / 60000 : 0;

  // --- Churn rate ---
  // Users active 7–8 days ago who are NOT active in the last 24 h
  const activeWeekAgo = new Set(
    events
      .filter((e) => {
        const t = new Date(e.created_at).getTime();
        return now - t >= MS_7D && now - t < MS_8D;
      })
      .map((e) => e.user_pseudo_id)
      .filter(Boolean)
  );
  const activeLast24h = new Set(
    events
      .filter((e) => now - new Date(e.created_at).getTime() < MS_24H)
      .map((e) => e.user_pseudo_id)
      .filter(Boolean)
  );
  const churnedUsers = [...activeWeekAgo].filter(
    (uid) => !activeLast24h.has(uid)
  );
  const churnRate =
    activeWeekAgo.size > 0
      ? (churnedUsers.length / activeWeekAgo.size) * 100
      : 0;

  // --- Day 1 retention ---
  // Users whose first_visit was 24–48 h ago → did they return (any event) in that window?
  const firstVisitByUser: Record<string, number> = {};
  for (const e of events) {
    if (e.event_name === "first_visit" && e.user_pseudo_id) {
      const t = new Date(e.created_at).getTime();
      if (
        !firstVisitByUser[e.user_pseudo_id] ||
        t < firstVisitByUser[e.user_pseudo_id]
      ) {
        firstVisitByUser[e.user_pseudo_id] = t;
      }
    }
  }

  let eligibleDay1 = 0;
  let returnedDay1 = 0;

  for (const [uid, firstTime] of Object.entries(firstVisitByUser)) {
    // Only count users whose first visit was > 24 h ago (had a chance to return)
    if (now - firstTime < MS_24H) continue;
    eligibleDay1++;

    const hasReturn = events.some(
      (e) =>
        e.user_pseudo_id === uid &&
        e.event_name !== "first_visit" &&
        new Date(e.created_at).getTime() >= firstTime + MS_24H &&
        new Date(e.created_at).getTime() < firstTime + MS_48H
    );
    if (hasReturn) returnedDay1++;
  }
  const day1Retention =
    eligibleDay1 > 0 ? (returnedDay1 / eligibleDay1) * 100 : 0;

  // --- Virality: avg shares per user ---
  const viralCoefficient =
    uniqueVisits > 0 ? totalShares / uniqueVisits : 0;

  // --- NPS: (happy% - sad%) * 100 ---
  const totalFeedback = feedback.length;
  const happyCount = feedback.filter((f) => f.rating === "happy").length;
  const normalCount = feedback.filter((f) => f.rating === "normal").length;
  const sadCount = feedback.filter((f) => f.rating === "sad").length;
  const happyPct = totalFeedback > 0 ? happyCount / totalFeedback : 0;
  const sadPct = totalFeedback > 0 ? sadCount / totalFeedback : 0;
  const npsScore = Math.round((happyPct - sadPct) * 100);

  return {
    uniqueVisits,
    activationRate: Math.round(activationRate * 10) / 10,
    activationGoalMet: activationRate > 50,
    totalQrScans,
    dau,
    totalPosts,
    totalLikes,
    totalShares,
    engagementRate: Math.round(engagementRate * 10) / 10,
    avgSessionLengthMin: Math.round(avgSessionLengthMin * 10) / 10,
    churnRate: Math.round(churnRate * 10) / 10,
    day1Retention: Math.round(day1Retention * 10) / 10,
    viralCoefficient: Math.round(viralCoefficient * 100) / 100,
    npsScore,
    npsThresholdMet: npsScore > 40,
    happyCount,
    normalCount,
    sadCount,
    totalFeedback,
  };
}

// ============================================================
// Dashboard Page
// ============================================================

export default function MetricsDashboard() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [metrics, setMetrics] = useState<Metrics>(EMPTY_METRICS);
  const [loading, setLoading] = useState(true);

  // Auth gate
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setAuthorized(params.get("secret") === ADMIN_SECRET);
  }, []);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);

    const [eventsRes, feedbackRes, postsRes] = await Promise.all([
      supabase
        .from("analytics_events")
        .select("id, event_name, user_pseudo_id, created_at")
        .order("created_at", { ascending: false })
        .limit(10000),
      supabase.from("feedback").select("rating"),
      supabase.from("posts").select("likes"),
    ]);

    const events = (eventsRes.data ?? []) as RawEvent[];
    const feedback = (feedbackRes.data ?? []) as RawFeedback[];
    const posts = (postsRes.data ?? []) as RawPost[];

    setMetrics(computeMetrics(events, feedback, posts));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authorized) fetchMetrics();
  }, [authorized, fetchMetrics]);

  // ----- Access denied -----
  if (authorized === null) return null; // still checking
  if (!authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
          <p className="text-gray-400 text-sm">
            Append <code className="text-purple-400">?secret=YOUR_KEY</code> to the URL.
          </p>
        </div>
      </div>
    );
  }

  // ----- Dashboard -----
  return (
    <div className="min-h-screen bg-linear-to-br from-slate-900 via-purple-950 to-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/5 backdrop-blur-xl border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Metrics Dashboard</h1>
          <p className="text-xs text-purple-300/70">Scan &amp; Go Analytics Engine</p>
        </div>
        <button
          onClick={fetchMetrics}
          className="text-sm text-purple-300 font-medium hover:text-white transition-colors"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-10">
        {/* ====== ACQUISITION & ACTIVATION ====== */}
        <Section title="Acquisition & Activation">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <GlassCard label="Unique Visits" value={metrics.uniqueVisits} />
            <GlassCard label="QR Scans" value={metrics.totalQrScans} />
            <GlassCard
              label="Activation Rate"
              value={`${metrics.activationRate}%`}
              goal="Goal: >50%"
              status={metrics.activationGoalMet ? "good" : "warn"}
            />
            <GlassCard
              label="Activated Users"
              value={Math.round(
                (metrics.activationRate / 100) * metrics.uniqueVisits
              )}
            />
          </div>
        </Section>

        {/* ====== ENGAGEMENT ====== */}
        <Section title="Engagement">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <GlassCard label="DAU (24h)" value={metrics.dau} />
            <GlassCard label="Total Posts" value={metrics.totalPosts} />
            <GlassCard label="Total Likes" value={metrics.totalLikes} />
            <GlassCard label="Total Shares" value={metrics.totalShares} />
            <GlassCard
              label="Engagement Rate"
              value={`${metrics.engagementRate}%`}
              subtitle="(Likes+Shares) / Views"
            />
            <GlassCard
              label="Avg Session"
              value={`${metrics.avgSessionLengthMin} min`}
              subtitle="Estimated"
            />
          </div>
        </Section>

        {/* ====== RETENTION ====== */}
        <Section title="Retention">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <GlassCard
              label="Churn Rate"
              value={`${metrics.churnRate}%`}
              subtitle="Active 7d ago, gone now"
              status={metrics.churnRate > 50 ? "bad" : "good"}
            />
            <GlassCard
              label="Day 1 Retention"
              value={`${metrics.day1Retention}%`}
              subtitle="Returned 24-48h after first visit"
            />
          </div>
        </Section>

        {/* ====== VIRALITY & SATISFACTION ====== */}
        <Section title="Virality & Satisfaction">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <GlassCard
              label="Viral Coefficient"
              value={metrics.viralCoefficient}
              subtitle="Shares per user"
            />
            <GlassCard
              label="NPS Score"
              value={metrics.npsScore}
              goal="Threshold: >40"
              status={metrics.npsThresholdMet ? "good" : "warn"}
            />
            <GlassCard
              label="Feedback Breakdown"
              value={`${metrics.happyCount} / ${metrics.normalCount} / ${metrics.sadCount}`}
              subtitle="😊 / 😐 / 😞"
            />
            <GlassCard
              label="Total Responses"
              value={metrics.totalFeedback}
            />
          </div>
        </Section>
      </main>
    </div>
  );
}

// ============================================================
// Reusable Components
// ============================================================

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-xs font-semibold text-purple-300/60 uppercase tracking-widest mb-4">
        {title}
      </h2>
      {children}
    </section>
  );
}

function GlassCard({
  label,
  value,
  subtitle,
  goal,
  status,
}: {
  label: string;
  value: string | number;
  subtitle?: string;
  goal?: string;
  status?: "good" | "warn" | "bad";
}) {
  const statusColor =
    status === "good"
      ? "text-emerald-400"
      : status === "warn"
        ? "text-amber-400"
        : status === "bad"
          ? "text-red-400"
          : "text-white";

  return (
    <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-4 hover:bg-white/10 transition-colors">
      <p className="text-[11px] font-medium text-purple-200/50 uppercase tracking-wide">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold ${statusColor}`}>{value}</p>
      {subtitle && (
        <p className="mt-0.5 text-[11px] text-purple-300/40">{subtitle}</p>
      )}
      {goal && (
        <p
          className={`mt-1 text-[10px] font-medium ${
            status === "good" ? "text-emerald-400/70" : "text-amber-400/70"
          }`}
        >
          {status === "good" ? "✓ " : "⚠ "}
          {goal}
        </p>
      )}
    </div>
  );
}
