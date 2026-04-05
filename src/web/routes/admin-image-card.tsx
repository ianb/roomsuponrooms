import { useState } from "react";
import { trpc } from "../trpc.js";
import { LightboxImage } from "../components/lightbox.js";
import type { WorldImageRecord } from "../../server/storage.js";

export type { WorldImageRecord };

interface ImageCardProps {
  gameId: string;
  imageType: string;
  label: string;
  defaultPrompt: string;
  stylePrompt: string;
  existing: WorldImageRecord | undefined;
  onGenerated: (record: WorldImageRecord) => void;
}

export function ImageCard({
  gameId,
  imageType,
  label,
  defaultPrompt,
  stylePrompt,
  existing,
  onGenerated,
}: ImageCardProps) {
  const [prompt, setPrompt] = useState(existing ? existing.promptUsed : defaultPrompt);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [imageVersion, setImageVersion] = useState(() => Date.now());

  async function handleGenerate() {
    setGenerating(true);
    setGenError(null);
    try {
      const result = await trpc.adminGenerateImage.mutate({
        gameId,
        imageType: imageType as "room-reference" | "npc-reference",
        prompt,
        stylePrompt,
      });
      if (result) {
        onGenerated(result as WorldImageRecord);
        setImageVersion(Date.now());
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setGenError(msg);
    } finally {
      setGenerating(false);
    }
  }

  const imageUrl = existing ? `/api/images/${gameId}/${imageType}.png?v=${imageVersion}` : null;

  return (
    <div className="rounded border border-content/20 p-4">
      <h3 className="mb-3 font-bold">{label}</h3>
      <div className="flex gap-4">
        <div className="w-64 shrink-0">
          {imageUrl ? (
            <LightboxImage
              key={imageVersion}
              src={imageUrl}
              alt={label}
              className="w-full rounded border border-content/10"
            />
          ) : (
            <div className="flex h-40 w-full items-center justify-center rounded border border-dashed border-content/20 text-sm text-content/30">
              No image yet
            </div>
          )}
        </div>
        <div className="flex-1">
          <div className="mb-3">
            <label className="mb-1 block text-sm font-bold">Generation Prompt</label>
            <textarea
              className="w-full rounded border border-content/20 bg-surface p-2 text-sm text-content"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>
          {existing ? (
            <div className="mb-3 text-xs text-content/40">
              Generated: {new Date(existing.createdAt).toLocaleString()}
            </div>
          ) : null}
          {genError ? <div className="mb-2 text-sm text-red-400">{genError}</div> : null}
          <button
            className="rounded bg-content/20 px-4 py-2 text-sm hover:bg-content/30 disabled:opacity-50"
            onClick={handleGenerate}
            disabled={generating || !stylePrompt}
          >
            {generating ? "Generating..." : existing ? "Regenerate" : "Generate"}
          </button>
          {!stylePrompt ? (
            <span className="ml-2 text-xs text-content/40">Save a style prompt first</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
