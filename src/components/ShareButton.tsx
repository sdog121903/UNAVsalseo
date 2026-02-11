"use client";

import { trackEvent } from "@/lib/analytics";

interface ShareButtonProps {
  postId: string;
  postContent: string;
  className?: string;
}

export default function ShareButton({
  postId,
  postContent,
  className = "",
}: ShareButtonProps) {
  const handleShare = async () => {
    const currentUrl = window.location.origin;
    const shareText = `"${postContent}" - Join the conversation at ${currentUrl}`;

    if (navigator.share) {
      try {
        await navigator.share({ text: shareText });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        console.error("Share failed:", err);
        return;
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareText);
        alert("Copied to clipboard!");
      } catch {
        console.error("Clipboard write failed");
        return;
      }
    }

    trackEvent("share_post", { postId });
  };

  return (
    <button
      onClick={handleShare}
      className={`flex items-center gap-1 transition-colors ${className}`}
      title="Share this post"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
        <polyline points="16 6 12 2 8 6" />
        <line x1="12" y1="2" x2="12" y2="15" />
      </svg>
    </button>
  );
}
