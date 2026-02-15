"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Post } from "@/lib/types";
import {
  canLikePost,
  recordLike,
  remainingLikes,
  canFetch,
  recordFetch,
} from "@/lib/rate-limit";
import FeedbackModal from "@/components/FeedbackModal";
import FirstTimeWelcomeModal from "@/components/FirstTimeWelcomeModal";
import ShareButton from "@/components/ShareButton";

// ===== Configuration =====
const PAGE_SIZE = 15;
const MASONRY_GAP = 16;
const FEEDBACK_DELAY_MS = 5 * 60 * 1000;
const FEEDBACK_SESSION_KEY = "sg_feedback_shown";
const WELCOME_SHOWN_KEY = "sg_welcome_shown";

export default function Home() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true); // initial load
  const [loadingMore, setLoadingMore] = useState(false); // pagination load
  const [hasMore, setHasMore] = useState(true); // are there more pages?
  const [refreshCooldown, setRefreshCooldown] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [masonryReady, setMasonryReady] = useState(false);
  const router = useRouter();

  const [likesLeft, setLikesLeft] = useState<Record<string, number>>({});

  // Refs
  const gridRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef(0); // current page index (0-based)
  const isFetchingRef = useRef(false); // prevent concurrent fetches
  const pullStartY = useRef(0);
  const isPulling = useRef(false);
  const pullDistanceRef = useRef(0);
  const refreshingRef = useRef(false);

  const syncLikesLeft = useCallback((postList: Post[]) => {
    const map: Record<string, number> = {};
    for (const p of postList) {
      map[p.id] = remainingLikes(p.id);
    }
    setLikesLeft(map);
  }, []);

  // ===== FETCH: Initial load (page 0) =====
  const fetchInitialPosts = useCallback(async () => {
    setLoading(true);
    setHasMore(true);
    pageRef.current = 0;
    isFetchingRef.current = true;

    const from = 0;
    const to = PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("Error fetching posts:", error);
    } else {
      const fetched = data as Post[];
      setPosts(fetched);
      syncLikesLeft(fetched);
      if (fetched.length < PAGE_SIZE) setHasMore(false);
    }

    setLoading(false);
    isFetchingRef.current = false;
  }, [syncLikesLeft]);

  // ===== FETCH: Next page (append) =====
  const fetchNextPage = useCallback(async () => {
    if (isFetchingRef.current || !hasMore) return;
    isFetchingRef.current = true;
    setLoadingMore(true);

    const nextPage = pageRef.current + 1;
    const from = nextPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("Error fetching more posts:", error);
    } else {
      const fetched = data as Post[];
      if (fetched.length < PAGE_SIZE) setHasMore(false);
      if (fetched.length > 0) {
        pageRef.current = nextPage;
        setPosts((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const newPosts = fetched.filter((p) => !existingIds.has(p.id));
          const merged = [...prev, ...newPosts];
          syncLikesLeft(merged);
          return merged;
        });
      }
    }

    setLoadingMore(false);
    isFetchingRef.current = false;
  }, [hasMore, syncLikesLeft]);

  // ===== Refresh (pull-to-refresh + button) =====
  const handleRefresh = useCallback(async () => {
    if (refreshingRef.current) return;
    if (!canFetch()) {
      setRefreshCooldown(true);
      setTimeout(() => setRefreshCooldown(false), 1500);
      return;
    }
    recordFetch();
    refreshingRef.current = true;
    setRefreshing(true);
    setMasonryReady(false);
    await fetchInitialPosts();
    setRefreshing(false);
    refreshingRef.current = false;
  }, [fetchInitialPosts]);

  // Initial load
  useEffect(() => {
    recordFetch();
    fetchInitialPosts();
  }, [fetchInitialPosts]);

  // Pull-to-refresh with visual indicator
  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY <= 0 && !refreshingRef.current) {
        pullStartY.current = e.touches[0].clientY;
        isPulling.current = true;
      }
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling.current || window.scrollY > 0) return;
      const distance = e.touches[0].clientY - pullStartY.current;
      if (distance > 0) {
        const capped = Math.min(distance, 150);
        pullDistanceRef.current = capped;
        setPullDistance(capped);
      } else {
        pullDistanceRef.current = 0;
        setPullDistance(0);
      }
    };
    const handleTouchEnd = () => {
      if (isPulling.current && pullDistanceRef.current > 80) {
        handleRefresh();
      }
      pullDistanceRef.current = 0;
      setPullDistance(0);
      isPulling.current = false;
    };
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd);
    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleRefresh]);

  // ===== INFINITE SCROLL: Sentinel observer =====
  // Deps include `loading` so the observer is created after the initial
  // skeleton disappears and the sentinel element enters the DOM.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingRef.current && hasMore) {
          fetchNextPage();
        }
      },
      { rootMargin: "400px" } // trigger 400px before reaching bottom
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextPage, hasMore, loading]);

  // ===== Feedback survey: once per session after 5 min =====
  useEffect(() => {
    if (sessionStorage.getItem(FEEDBACK_SESSION_KEY)) return;
    const timer = setTimeout(() => {
      if (!sessionStorage.getItem(FEEDBACK_SESSION_KEY)) {
        setShowFeedback(true);
      }
    }, FEEDBACK_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  // ===== First-time welcome popup (once per device) =====
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem(WELCOME_SHOWN_KEY)) {
      setShowWelcome(true);
    }
  }, []);

  // ===== MASONRY ENGINE =====
  const layoutMasonry = useCallback(() => {
    const container = gridRef.current;
    if (!container) return;

    const children = Array.from(container.children) as HTMLElement[];
    if (!children.length) return;

    const containerWidth = container.offsetWidth;
    let cols = 1;
    if (window.innerWidth >= 1024) cols = 3;
    else if (window.innerWidth >= 768) cols = 2;

    if (cols === 1) {
      children.forEach((c) => {
        c.style.position = "";
        c.style.transform = "";
        c.style.width = "";
      });
      container.style.height = "";
      setMasonryReady(true);
      return;
    }

    const colWidth = (containerWidth - MASONRY_GAP * (cols - 1)) / cols;
    const colHeights = new Array(cols).fill(0);

    children.forEach((card) => {
      card.style.position = "absolute";
      card.style.width = `${colWidth}px`;
      const shortest = colHeights.indexOf(Math.min(...colHeights));
      const x = shortest * (colWidth + MASONRY_GAP);
      const y = colHeights[shortest];
      card.style.transform = `translate(${x}px, ${y}px)`;
      colHeights[shortest] += card.offsetHeight + MASONRY_GAP;
    });

    container.style.height = `${Math.max(...colHeights)}px`;
    setMasonryReady(true);
  }, []);

  // Re-layout when posts change (initial or appended)
  useEffect(() => {
    if (posts.length === 0) return;

    const timer = setTimeout(layoutMasonry, 50);

    const ro = new ResizeObserver(() => layoutMasonry());
    if (gridRef.current) ro.observe(gridRef.current);

    const container = gridRef.current;
    if (container) {
      const imgs = container.querySelectorAll("img");
      imgs.forEach((img) => {
        if (!img.complete) {
          img.addEventListener("load", layoutMasonry, { once: true });
        }
      });
    }

    return () => {
      clearTimeout(timer);
      ro.disconnect();
    };
  }, [posts, layoutMasonry]);

  // ===== Like handler =====
  const handleLike = async (postId: string, currentLikes: number) => {
    if (!canLikePost(postId)) return;
    const allowed = recordLike(postId);
    if (!allowed) return;

    setLikesLeft((prev) => ({
      ...prev,
      [postId]: remainingLikes(postId),
    }));

    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, likes: currentLikes + 1 } : p
      )
    );

    const { error } = await supabase
      .from("posts")
      .update({ likes: currentLikes + 1 })
      .eq("id", postId);

    if (error) {
      console.error("Error liking post:", error);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, likes: currentLikes } : p
        )
      );
    }
  };

  const timeAgo = (dateStr: string) => {
    const seconds = Math.floor(
      (Date.now() - new Date(dateStr).getTime()) / 1000
    );
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  };

  const hasImage = (post: Post) =>
    post.media_url && post.media_type === "image";

  return (
    <div className="min-h-screen">
      {/* ===== HEADER ===== */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-maroon-950/80 border-b border-white/10 px-5 py-3 flex items-center justify-between">
        <img
          src="/assets/logosalseo.png"
          alt="Un@vSalseo"
          className="h-16 w-16 rounded-full object-cover"
        />
        <button
          onClick={handleRefresh}
          disabled={refreshing || refreshCooldown}
          className={`text-sm font-medium transition-colors flex items-center gap-2 ${
            refreshing || refreshCooldown
              ? "text-white/30 cursor-not-allowed"
              : "text-white/70 hover:text-white"
          }`}
        >
          {refreshing ? (
            <>
              <img
                src="/assets/logosalseo-nobg.png"
                alt=""
                className="h-5 w-5 animate-spin"
              />
              <span>Loading…</span>
            </>
          ) : refreshCooldown ? (
            "Wait..."
          ) : (
            "Refresh"
          )}
        </button>
      </header>

      {/* ===== PULL-TO-REFRESH SPINNER ===== */}
      <div
        className="flex justify-center items-center overflow-hidden"
        style={{
          height: refreshing ? 80 : pullDistance > 0 ? Math.min(pullDistance * 0.7, 100) : 0,
          transition: pullDistance > 0 ? "none" : "height 0.3s ease-out",
        }}
      >
        <img
          src="/assets/logosalseo-nobg.png"
          alt="Refreshing"
          className={`w-10 h-10 ${refreshing ? "animate-spin" : ""}`}
          style={{
            opacity: refreshing ? 1 : Math.min(pullDistance / 80, 1),
            transform: refreshing ? undefined : `rotate(${pullDistance * 4}deg)`,
          }}
        />
      </div>

      {/* ===== FEED ===== */}
      <main className="px-[2.5%] py-5 pb-28">
        {/* Initial loading state */}
        {loading && posts.length === 0 ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="mx-auto w-[95%] rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl overflow-hidden animate-pulse"
              >
                <div className="px-4 pt-4 pb-2 space-y-2">
                  <div className="h-4 bg-white/10 rounded w-3/4" />
                  <div className="h-4 bg-white/10 rounded w-1/2" />
                </div>
                <div className="px-4 pb-3 pt-2 flex justify-between">
                  <div className="h-3 bg-white/10 rounded w-10" />
                  <div className="h-3 bg-white/10 rounded w-16" />
                </div>
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <p className="text-center text-white/40 mt-16">
            No posts yet. Be the first!
          </p>
        ) : (
          <>
            {/* Masonry grid */}
            <div
              ref={gridRef}
              className={`relative transition-opacity duration-300 ${
                masonryReady ? "opacity-100" : "opacity-0"
              }`}
            >
              {posts.map((post) => {
                const left = likesLeft[post.id] ?? 5;
                const maxedOut = left <= 0;
                const withImage = hasImage(post);

                return (
                  <div
                    key={post.id}
                    className="mb-4 md:mb-0 mx-auto w-[95%] md:w-auto md:mx-0 rounded-2xl border border-white/15 bg-white/[0.07] backdrop-blur-xl overflow-hidden"
                  >
                    <div className="px-4 pt-4 pb-2">
                      <p className="text-white text-[15px] leading-relaxed whitespace-pre-wrap wrap-break-word">
                        {post.content}
                      </p>
                    </div>

                    {withImage && (
                      <div className="px-[5%] pb-2">
                        <img
                          src={post.media_url!}
                          alt=""
                          className="w-full rounded-xl object-contain"
                        />
                      </div>
                    )}

                    <div className="px-4 pb-3 pt-1 flex items-center justify-between text-[13px] text-white/50">
                      <span>{timeAgo(post.created_at)}</span>
                      <div className="flex items-center gap-4">
                        <ShareButton
                          postId={post.id}
                          postContent={post.content}
                          className="text-white hover:text-white/90"
                        />
                        <button
                          onClick={() => handleLike(post.id, post.likes)}
                          disabled={maxedOut}
                          className={`rounded-full border-2 border-white bg-white/15 hover:bg-white/25 h-11 min-w-11 px-3 flex items-center justify-center gap-1.5 transition-colors ${
                            maxedOut
                              ? "text-white/20 cursor-not-allowed opacity-60"
                              : "text-white/90 hover:text-red-400"
                          }`}
                          title={
                            maxedOut
                              ? "Like limit reached"
                              : `${left} like${left !== 1 ? "s" : ""} left`
                          }
                        >
                          <span className={`text-lg ${maxedOut ? "" : "text-red-400/90"}`}>
                            &#9829;
                          </span>
                          <span className="text-[15px] font-medium">{post.likes}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Loading skeletons while fetching next page */}
            {loadingMore && (
              <div className="mt-4 space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={`skel-${i}`}
                    className="mx-auto w-[95%] rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl overflow-hidden animate-pulse"
                  >
                    <div className="px-4 pt-4 pb-2 space-y-2">
                      <div className="h-4 bg-white/10 rounded w-3/4" />
                      <div className="h-4 bg-white/10 rounded w-1/2" />
                    </div>
                    <div className="px-4 pb-3 pt-2 flex justify-between">
                      <div className="h-3 bg-white/10 rounded w-10" />
                      <div className="h-3 bg-white/10 rounded w-16" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Sentinel: invisible trigger for infinite scroll */}
            {hasMore && <div ref={sentinelRef} className="h-1" />}

            {/* End of feed */}
            {!hasMore && posts.length > 0 && (
              <p className="text-center text-white/20 text-sm mt-8">
                You&apos;ve reached the end
              </p>
            )}
          </>
        )}
      </main>

      {/* ===== CREATE POST CTA ===== */}
      <button
        onClick={() => router.push("/create")}
        className="fixed bottom-6 right-6 z-20 w-23 h-23 bg-white text-black text-6xl font-bold rounded-full shadow-lg hover:bg-gray-100 transition-colors flex items-center justify-center"
      >
        +
      </button>

      {/* First-time welcome — once per device */}
      <FirstTimeWelcomeModal
        open={showWelcome}
        onClose={() => {
          setShowWelcome(false);
          localStorage.setItem(WELCOME_SHOWN_KEY, "true");
        }}
      />

      {/* Feedback Modal — once per session, after 5 min */}
      <FeedbackModal
        open={showFeedback}
        onClose={() => {
          setShowFeedback(false);
          sessionStorage.setItem(FEEDBACK_SESSION_KEY, "true");
        }}
      />
    </div>
  );
}
