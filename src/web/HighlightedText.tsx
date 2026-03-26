import type { ReactNode } from "react";

const HIGHLIGHT_PATTERN = /{{([^|]+)\|([^}]+)}}|\[\[([^\]]+)]]/g;

interface TextSegment {
  type: "text" | "entity" | "topic";
  text: string;
  entityId?: string;
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
    if (match[1] && match[2]) {
      // Entity ref: {{entityId|displayText}}
      segments.push({ type: "entity", text: match[2], entityId: match[1] });
    } else if (match[3]) {
      // Topic word: [[word]]
      segments.push({ type: "topic", text: match[3] });
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
  onEntityClick,
  onTopicClick,
}: {
  text: string;
  onEntityClick?: (entityId: string) => void;
  onTopicClick?: (word: string) => void;
}): ReactNode {
  const segments = parseSegments(text);

  return segments.map((seg, i) => {
    if (seg.type === "entity") {
      return (
        <span
          key={i}
          className="cursor-pointer text-amber-400 hover:underline"
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
          className="cursor-pointer text-cyan-400 hover:underline"
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
    return <span key={i}>{seg.text}</span>;
  });
}
