import { useState } from "react";
import type { ReactNode } from "react";

const HIGHLIGHT_PATTERN =
  /{img:([^|}]+)\|?([^}]*)}|{{([^|]+)\|([^}]+)}}|\[\[([^\]]+)]]|<<([^>]+)>>|\(\(([^|]+)\|([^)]+)\)\)|{!([^!]+)!}/g;

interface TextSegment {
  type: "text" | "entity" | "topic" | "direction" | "command" | "refusal" | "image";
  text: string;
  entityId?: string;
  command?: string;
}

function parseSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;

  HIGHLIGHT_PATTERN.lastIndex = 0;
  let match = HIGHLIGHT_PATTERN.exec(text);
  while (match !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", text: text.slice(lastIndex, match.index) });
    }
    if (match[1]) {
      segments.push({ type: "image", text: match[2] || "", entityId: match[1] });
    } else if (match[3] && match[4]) {
      segments.push({ type: "entity", text: match[4], entityId: match[3] });
    } else if (match[5]) {
      segments.push({ type: "topic", text: match[5] });
    } else if (match[6]) {
      segments.push({ type: "direction", text: match[6] });
    } else if (match[7] && match[8]) {
      segments.push({ type: "command", text: match[8], command: match[7] });
    } else if (match[9]) {
      segments.push({ type: "refusal", text: match[9] });
    }
    lastIndex = match.index + match[0].length;
    match = HIGHLIGHT_PATTERN.exec(text);
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", text: text.slice(lastIndex) });
  }

  return segments;
}

export function HighlightedText({
  text,
  gameId,
  onEntityClick,
  onTopicClick,
  onCommandClick,
  onGenerateImage,
  imageStatus,
  imageVersions,
  imagePrompts,
  generatingImages,
  isAdmin,
}: {
  text: string;
  gameId?: string;
  onEntityClick?: (entityId: string) => void;
  onTopicClick?: (word: string) => void;
  onCommandClick?: (command: string) => void;
  onGenerateImage?: (entityId: string) => void;
  imageStatus?: Record<string, boolean>;
  imageVersions?: Record<string, number>;
  imagePrompts?: Record<string, string>;
  generatingImages?: Record<string, boolean>;
  isAdmin?: boolean;
}): ReactNode {
  const segments = parseSegments(text);

  return segments.map((seg, i) => {
    if (seg.type === "image" && seg.entityId && gameId) {
      return (
        <EntityImage
          key={i}
          entityId={seg.entityId}
          entityName={seg.text}
          gameId={gameId}
          hasImage={imageStatus ? imageStatus[seg.entityId] === true : false}
          parentVersion={imageVersions ? imageVersions[seg.entityId] || 0 : 0}
          imageAlt={imagePrompts ? imagePrompts[seg.entityId] || "" : ""}
          generating={generatingImages ? generatingImages[seg.entityId] === true : false}
          isAdmin={isAdmin || false}
          onGenerate={onGenerateImage}
        />
      );
    }
    if (seg.type === "entity") {
      const isRoom = seg.entityId ? seg.entityId.startsWith("room:") : false;
      return (
        <span
          key={i}
          className={`cursor-pointer text-highlight-entity hover:underline ${isRoom ? "font-heading font-bold" : ""}`}
          onClick={() => {
            if (onEntityClick && seg.entityId) {
              onEntityClick(seg.entityId);
            }
          }}
        >
          {seg.text}
        </span>
      );
    }
    if (seg.type === "topic") {
      return (
        <span
          key={i}
          className="cursor-pointer text-highlight-topic hover:underline"
          onClick={() => {
            if (onTopicClick) {
              onTopicClick(seg.text.toLowerCase());
            }
          }}
        >
          {seg.text}
        </span>
      );
    }
    if (seg.type === "direction") {
      return (
        <span key={i} className="text-highlight-direction">
          {seg.text}
        </span>
      );
    }
    if (seg.type === "refusal") {
      return (
        <span key={i} className="italic text-content/60">
          <span className="not-italic text-danger/70">&#x2205;</span> {seg.text}
        </span>
      );
    }
    if (seg.type === "command") {
      return (
        <button
          key={i}
          className="ml-1 cursor-pointer rounded border border-command/50 px-1.5 py-0.5 text-xs text-command hover:bg-command/15"
          onClick={() => {
            if (onCommandClick && seg.command) {
              onCommandClick(seg.command);
            }
          }}
        >
          {seg.text}
        </button>
      );
    }
    return <span key={i}>{seg.text}</span>;
  });
}

function EntityImage({
  entityId,
  entityName,
  gameId,
  hasImage,
  parentVersion,
  imageAlt,
  generating,
  isAdmin,
  onGenerate,
}: {
  entityId: string;
  entityName: string;
  gameId: string;
  hasImage: boolean;
  parentVersion: number;
  imageAlt: string;
  generating: boolean;
  isAdmin: boolean;
  onGenerate?: (entityId: string) => void;
}) {
  const safeId = entityId.replace(/:/g, "/");
  const isRoom = entityId.startsWith("room:");
  const [imgError, setImgError] = useState(false);
  const [lightbox, setLightbox] = useState(false);

  const imgSrc = `/api/images/${gameId}/entities/${safeId}.png?v=${parentVersion}`;
  const showGenButton = isAdmin && onGenerate && (!hasImage || imgError);

  function handleRegenerate() {
    if (!onGenerate) return;
    setImgError(false);
    onGenerate(entityId);
  }

  if (hasImage && !imgError) {
    return (
      <>
        <div className={`my-2 ${isRoom ? "mx-auto max-w-lg" : "float-right ml-3 w-32"}`}>
          <img
            src={imgSrc}
            alt={imageAlt ? `[image: ${imageAlt}]` : entityName}
            className="w-full cursor-zoom-in rounded border border-content/10"
            onError={() => setImgError(true)}
            onLoad={(e) => {
              const el = e.currentTarget.closest("[data-scroll-container]");
              if (el) el.scrollTop = el.scrollHeight;
            }}
            onClick={() => setLightbox(true)}
          />
          {isAdmin && onGenerate ? (
            <button
              className="mt-1 text-xs text-content/30 hover:text-content/60 disabled:opacity-50"
              onClick={handleRegenerate}
              disabled={generating}
            >
              {generating ? "Regenerating..." : "Regenerate"}
            </button>
          ) : null}
        </div>
        {lightbox ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
            onClick={() => setLightbox(false)}
          >
            <img
              src={imgSrc}
              alt={imageAlt ? `[image: ${imageAlt}]` : entityName}
              className="max-h-[90vh] max-w-[90vw] rounded shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        ) : null}
      </>
    );
  }

  if (showGenButton) {
    function handleClick() {
      if (!onGenerate) return;
      setImgError(false);
      onGenerate(entityId);
    }
    const label = entityName ? `Generate image for ${entityName}` : "Generate image";
    return (
      <div className="my-1">
        <button
          className="rounded border border-content/20 px-2 py-1 text-xs text-content/40 hover:bg-content/10 hover:text-content/60 disabled:opacity-50"
          onClick={handleClick}
          disabled={generating}
        >
          {generating ? "Generating..." : label}
        </button>
      </div>
    );
  }

  return null;
}
