"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { canPost, recordPost, postsRemaining } from "@/lib/rate-limit";
import { trackEvent } from "@/lib/analytics";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export default function CreatePost() {
  const [content, setContent] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [waitSeconds, setWaitSeconds] = useState(0);
  const [remaining, setRemaining] = useState(3);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const maxChars = 255;
  const charsLeft = maxChars - content.length;

  useEffect(() => {
    const check = () => {
      const status = canPost();
      setRateLimited(!status.allowed);
      setWaitSeconds(status.waitSeconds);
      setRemaining(postsRemaining());
    };
    check();
    const interval = setInterval(check, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatWait = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Only image files are allowed.");
      e.target.value = "";
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      alert("Image must be under 5 MB.");
      e.target.value = "";
      return;
    }

    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    const trimmed = content.trim();
    if (!trimmed) return;

    const status = canPost();
    if (!status.allowed) {
      setRateLimited(true);
      setWaitSeconds(status.waitSeconds);
      return;
    }

    setSubmitting(true);

    let mediaUrl: string | null = null;
    let mediaType: string | null = null;

    if (imageFile) {
      const fileExt = imageFile.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const fileName = `${crypto.randomUUID()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("post-images")
        .upload(fileName, imageFile, {
          contentType: imageFile.type,
          upsert: false,
        });

      if (uploadError) {
        console.error("Error uploading image:", uploadError);
        alert("Failed to upload image. Please try again.");
        setSubmitting(false);
        return;
      }

      const { data: urlData } = supabase.storage
        .from("post-images")
        .getPublicUrl(fileName);

      mediaUrl = urlData.publicUrl;
      mediaType = "image";
    }

    const { error } = await supabase.from("posts").insert({
      content: trimmed,
      media_url: mediaUrl,
      media_type: mediaType,
    });

    if (error) {
      console.error("Error creating post:", error);
      alert("Failed to post. Please try again.");
      setSubmitting(false);
      return;
    }

    recordPost();
    trackEvent("post_created");
    router.push("/");
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-xl bg-maroon-950/80 border-b border-white/10 px-5 py-3 flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="text-sm text-white/60 font-medium hover:text-white transition-colors"
        >
          &larr; Back
        </button>
        <h1 className="text-lg font-bold text-white">New Post</h1>
        <div className="w-12" />
      </header>

      {/* Form */}
      <main className="max-w-lg mx-auto px-4 py-6">
        {rateLimited && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-300">
            You&apos;ve reached the post limit (3 per 10 minutes). Try again in{" "}
            <span className="font-bold">{formatWait(waitSeconds)}</span>.
          </div>
        )}

        {!rateLimited && (
          <div className="mb-4 text-sm text-white/40">
            {remaining} post{remaining !== 1 ? "s" : ""} remaining in this
            window
          </div>
        )}

        <div className="rounded-2xl border border-white/15 bg-white/[0.07] backdrop-blur-xl p-4">
          <textarea
            value={content}
            onChange={(e) => {
              if (e.target.value.length <= maxChars) {
                setContent(e.target.value);
              }
            }}
            placeholder={
              rateLimited
                ? "Please wait before posting again..."
                : "What's on your mind?"
            }
            rows={4}
            className="w-full resize-none outline-none bg-transparent text-white text-[15px] placeholder-white/30"
            autoFocus
            disabled={rateLimited}
          />

          <div className="mt-2 text-right text-sm text-white/30">
            <span
              className={charsLeft < 30 ? "text-red-400 font-medium" : ""}
            >
              {charsLeft}
            </span>{" "}
            characters left
          </div>
        </div>

        {/* Image upload */}
        <div className="mt-1">
          {imagePreview ? (
            <div className="relative rounded-2xl overflow-hidden border border-white/15">
              <img
                src={imagePreview}
                alt="Preview"
                className="w-full max-h-64 object-cover"
              />
              <button
                onClick={removeImage}
                className="absolute top-2 right-2 bg-black/60 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold hover:bg-black/80"
              >
                &times;
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={rateLimited}
              className="w-full border-2 border-dashed border-white/15 rounded-2xl py-12 flex flex-col items-center gap-3 text-white/30 hover:border-white/30 hover:text-white/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <span className="text-base font-medium">Add an image</span>
              <span className="text-sm">JPEG, PNG, GIF, WebP &middot; Max 5 MB</span>
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting || content.trim().length === 0 || rateLimited}
          className="mt-4 w-full bg-white/15 border border-white/20 text-white py-3 rounded-2xl font-semibold text-base hover:bg-white/25 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          {submitting
            ? imageFile
              ? "Uploading image..."
              : "Posting..."
            : rateLimited
              ? "Rate Limited"
              : "Post"}
        </button>
      </main>
    </div>
  );
}
