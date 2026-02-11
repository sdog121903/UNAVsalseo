"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

interface DashboardData {
  totalPosts: number;
  totalLikes: number;
  totalFeedback: number;
  happyCount: number;
  normalCount: number;
  sadCount: number;
  happyPercent: number;
  sadPercent: number;
  totalShares: number;
}

const EMPTY: DashboardData = {
  totalPosts: 0,
  totalLikes: 0,
  totalFeedback: 0,
  happyCount: 0,
  normalCount: 0,
  sadCount: 0,
  happyPercent: 0,
  sadPercent: 0,
  totalShares: 0,
};

export default function AnalyticsDashboard() {
  const [data, setData] = useState<DashboardData>(EMPTY);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);

    // Run all queries in parallel
    const [postsRes, feedbackRes, sharesRes] = await Promise.all([
      // 1. Posts: count + total likes
      supabase.from("posts").select("likes"),

      // 2. Feedback: all ratings
      supabase.from("feedback").select("rating"),

      // 3. Analytics events: count share_post events
      supabase
        .from("analytics_events")
        .select("id")
        .eq("event_name", "share_post"),
    ]);

    // --- Posts ---
    const posts = postsRes.data ?? [];
    const totalPosts = posts.length;
    const totalLikes = posts.reduce(
      (sum, p) => sum + ((p as { likes: number }).likes ?? 0),
      0
    );

    // --- Feedback ---
    const feedbackRows = feedbackRes.data ?? [];
    const totalFeedback = feedbackRows.length;
    const happyCount = feedbackRows.filter(
      (f) => (f as { rating: string }).rating === "happy"
    ).length;
    const normalCount = feedbackRows.filter(
      (f) => (f as { rating: string }).rating === "normal"
    ).length;
    const sadCount = feedbackRows.filter(
      (f) => (f as { rating: string }).rating === "sad"
    ).length;
    const happyPercent =
      totalFeedback > 0 ? Math.round((happyCount / totalFeedback) * 100) : 0;
    const sadPercent =
      totalFeedback > 0 ? Math.round((sadCount / totalFeedback) * 100) : 0;

    // --- Shares ---
    const totalShares = (sharesRes.data ?? []).length;

    setData({
      totalPosts,
      totalLikes,
      totalFeedback,
      happyCount,
      normalCount,
      sadCount,
      happyPercent,
      sadPercent,
      totalShares,
    });

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">Analytics Dashboard</h1>
        <button
          onClick={fetchDashboard}
          className="text-sm text-blue-600 font-medium hover:text-blue-800"
        >
          Refresh
        </button>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {loading ? (
          <p className="text-center text-gray-500 mt-10">
            Loading analytics...
          </p>
        ) : (
          <div className="space-y-6">
            {/* ---- Engagement ---- */}
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Engagement
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Total Posts" value={data.totalPosts} />
                <StatCard label="Total Likes" value={data.totalLikes} />
              </div>
            </section>

            {/* ---- Satisfaction ---- */}
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Satisfaction Score
              </h2>
              <div className="grid grid-cols-3 gap-3">
                <StatCard
                  label="Happy"
                  value={`${data.happyPercent}%`}
                  subtitle={`${data.happyCount} votes`}
                  accent="text-green-600"
                />
                <StatCard
                  label="Normal"
                  value={`${100 - data.happyPercent - data.sadPercent}%`}
                  subtitle={`${data.normalCount} votes`}
                  accent="text-yellow-600"
                />
                <StatCard
                  label="Sad"
                  value={`${data.sadPercent}%`}
                  subtitle={`${data.sadCount} votes`}
                  accent="text-red-600"
                />
              </div>
              {data.totalFeedback === 0 && (
                <p className="mt-2 text-sm text-gray-400">
                  No feedback collected yet.
                </p>
              )}
            </section>

            {/* ---- Virality ---- */}
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Virality
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Total Shares" value={data.totalShares} />
                <StatCard
                  label="Feedback Responses"
                  value={data.totalFeedback}
                />
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

// ----- Reusable stat card -----
function StatCard({
  label,
  value,
  subtitle,
  accent,
}: {
  label: string;
  value: string | number;
  subtitle?: string;
  accent?: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold ${accent ?? "text-gray-900"}`}>
        {value}
      </p>
      {subtitle && (
        <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>
      )}
    </div>
  );
}
