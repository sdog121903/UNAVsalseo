"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { trackEvent } from "@/lib/analytics";

type Rating = "happy" | "normal" | "sad";

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
}

const ratings: { value: Rating; emoji: string; label: string }[] = [
  { value: "happy", emoji: "😊", label: "Happy" },
  { value: "normal", emoji: "😐", label: "Normal" },
  { value: "sad", emoji: "😞", label: "Sad" },
];

export default function FeedbackModal({ open, onClose }: FeedbackModalProps) {
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleRate = async (rating: Rating) => {
    setSubmitting(true);

    // 1. Save to feedback table (for NPS calculations)
    const { error } = await supabase.from("feedback").insert({ rating });
    if (error) {
      console.error("Error saving feedback:", error);
    }

    // 2. Track the event (for user-level analytics)
    trackEvent("feedback_submitted", {
      metadata: { rating },
    });

    setSubmitting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl p-6 mx-4 w-full max-w-sm text-center">
        <h2 className="text-lg font-bold text-gray-900 mb-1">
          How is your experience?
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          Your feedback helps us improve
        </p>

        <div className="flex justify-center gap-6">
          {ratings.map(({ value, emoji, label }) => (
            <button
              key={value}
              onClick={() => handleRate(value)}
              disabled={submitting}
              className="flex flex-col items-center gap-1 p-3 rounded-xl hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              <span className="text-4xl">{emoji}</span>
              <span className="text-xs font-medium text-gray-600">
                {label}
              </span>
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          className="mt-5 text-sm text-gray-400 hover:text-gray-600"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
