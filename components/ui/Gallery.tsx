"use client";

import React, { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const DEFAULT_PLACEHOLDER =
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=1600&auto=format&fit=crop";

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(n, max));

// --- Simple, resilient carousel ---
export function ImageCarousel({
  images,
  rounded = true,
  openLightbox,
  placeholder = DEFAULT_PLACEHOLDER,
}: {
  images: string[];
  rounded?: boolean;
  openLightbox?: (startAt: number) => void;
  placeholder?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);

  const list = images && images.length ? images : [placeholder];

  // Keep index in range when list length changes (reorder / add / remove)
  useEffect(() => {
    setIndex((i) => clamp(i, 0, Math.max(0, list.length - 1)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length]);

  const scrollTo = (i: number) => {
    const el = containerRef.current;
    if (!el) return;
    const clamped = clamp(i, 0, Math.max(0, list.length - 1));
    el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
    setIndex(clamped);
  };

  const onPrev = () => scrollTo(index - 1);
  const onNext = () => scrollTo(index + 1);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className={`w-full overflow-x-auto flex snap-x snap-mandatory scroll-smooth ${rounded ? "rounded-xl" : ""} border border-blue-400/20`}
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / el.clientWidth);
          const clamped = clamp(i, 0, Math.max(0, list.length - 1));
          if (clamped !== index) setIndex(clamped);
        }}
      >
        {list.map((src, i) => (
          <div key={`${i}-${src.slice(0, 24)}`} className="min-w-full snap-center aspect-video overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={`Image ${i + 1}`}
              className="w-full h-full object-cover"
              onClick={() => openLightbox?.(i)}
            />
          </div>
        ))}
      </div>

      {list.length > 1 && (
        <>
          <button
            type="button"
            onClick={onPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 hover:bg-black/60 text-white"
            aria-label="Previous image"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={onNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 hover:bg-black/60 text-white"
            aria-label="Next image"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
            {list.map((_, i) => (
              <span
                key={`dot-${i}`}
                className={`h-1.5 w-1.5 rounded-full ${i === index ? "bg-white" : "bg-white/50"}`}
                onClick={() => scrollTo(i)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// --- Near-fullscreen Lightbox with keyboard navigation ---
export function Lightbox({
  images,
  open,
  startIndex = 0,
  onOpenChange,
  placeholder = DEFAULT_PLACEHOLDER,
}: {
  images: string[];
  open: boolean;
  startIndex?: number;
  onOpenChange: (open: boolean) => void;
  placeholder?: string;
}) {
  const [idx, setIdx] = useState(startIndex);

  useEffect(() => setIdx(startIndex), [startIndex, open]);
  useEffect(() => {
    if (!images || images.length === 0) return;
    if (idx >= images.length) setIdx(0);
  }, [images.length, idx]);

  const next = () => setIdx((v) => (images.length ? (v + 1) % images.length : 0));
  const prev = () => setIdx((v) => (images.length ? (v - 1 + images.length) % images.length : 0));

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, images.length]);

  const src = images && images.length ? images[idx] : placeholder;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] h-[92vh] max-w-none p-0 bg-black/90 border-0 rounded-xl">
        <div className="relative w-full h-full">
          <div className="w-full h-[85vh] overflow-hidden rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={`Image ${idx + 1}`}
              className="w-full h-full object-contain bg-black"
              onClick={next}
            />
          </div>
          {images && images.length > 1 && (
            <>
              <button
                type="button"
                onClick={prev}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 hover:bg-black/70 text-white"
                aria-label="Previous image"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                type="button"
                onClick={next}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 hover:bg-black/70 text-white"
                aria-label="Next image"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
