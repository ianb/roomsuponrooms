import { useState, useEffect } from "react";

interface LightboxImageProps {
  src: string;
  alt: string;
  className?: string;
}

/**
 * An image that opens in a fullscreen overlay when clicked.
 * Press Escape or click the backdrop to close.
 */
export function LightboxImage({ src, alt, className }: LightboxImageProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <img
        src={src}
        alt={alt}
        className={`cursor-zoom-in ${className || ""}`}
        onClick={() => setOpen(true)}
      />
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setOpen(false)}
        >
          <img
            src={src}
            alt={alt}
            className="max-h-[90vh] max-w-[90vw] rounded shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  );
}
