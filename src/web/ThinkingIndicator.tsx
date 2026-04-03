import { useState, useEffect } from "react";

const DEFAULT_AI_MESSAGES = [
  "The world shifts and reshapes...",
  "Something stirs in the unseen...",
  "Reality bends to accommodate...",
  "The story unfolds...",
];

let aiMessageCounter = 0;
function pickFromMessages(messages: string[]): string {
  const msg = messages[aiMessageCounter % messages.length]!;
  aiMessageCounter++;
  return msg;
}

export function ThinkingIndicator({
  phase,
  customMessages,
}: {
  phase: "thinking" | "ai" | null;
  customMessages?: string[] | null;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 400);
    return () => clearTimeout(timer);
  }, []);

  if (!visible && phase !== "ai") return null;

  if (phase !== "ai") {
    return <div className="animate-pulse text-content/50">...</div>;
  }

  const messages = customMessages || DEFAULT_AI_MESSAGES;
  const text = pickFromMessages(messages);
  return <div className="animate-pulse text-ai italic">{text}</div>;
}
