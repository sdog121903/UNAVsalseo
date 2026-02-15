"use client";

import { useEffect } from "react";

interface FirstTimeWelcomeModalProps {
  open: boolean;
  onClose: () => void;
}

export default function FirstTimeWelcomeModal({
  open,
  onClose,
}: FirstTimeWelcomeModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
      {/* Backdrop — click anywhere to close */}
      <div
        className="absolute inset-0 bg-black/50 cursor-pointer"
        onClick={onClose}
        aria-hidden
      />

      {/* Modal card — stop propagation so clicking card doesn't close */}
      <div
        className="relative w-full max-w-sm rounded-2xl border border-white/20 bg-maroon-950/95 backdrop-blur-xl p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Easy close: X in corner */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Cerrar"
        >
          &times;
        </button>

        <p className="text-white text-center text-[15px] leading-relaxed pr-6">
          Aqui puedes decir lo que quieras... nadie va saber quien eres... nadie
          nunca se va enterar...
        </p>

        <button
          onClick={onClose}
          className="mt-5 w-full py-2.5 rounded-xl bg-white/20 text-white text-sm font-medium hover:bg-white/30 transition-colors"
        >
          Entendido
        </button>
      </div>
    </div>
  );
}
