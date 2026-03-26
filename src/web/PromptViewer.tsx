import { useState, useEffect } from "react";
import { trpc } from "./trpc.js";

interface PromptData {
  verb: string;
  create: string;
  world: string | null;
  worldVerb: string | null;
  worldCreate: string | null;
  region: string | null;
  room: string | null;
}

export function PromptViewer({ gameId, revision }: { gameId: string; revision: number }) {
  const [data, setData] = useState<PromptData | null>(null);
  const [activeTab, setActiveTab] = useState<"composed-verb" | "composed-create" | "layers">(
    "layers",
  );

  useEffect(() => {
    trpc.prompts.query({ gameId }).then(setData);
  }, [gameId, revision]);

  if (!data) {
    return <div className="p-3 text-sm text-gray-400">Loading prompts...</div>;
  }

  const tabs: Array<{ key: typeof activeTab; label: string }> = [
    { key: "layers", label: "Layers" },
    { key: "composed-verb", label: "Verb" },
    { key: "composed-create", label: "Create" },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex border-b border-gray-700">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-2 py-1.5 text-xs ${
              activeTab === tab.key
                ? "border-b-2 border-blue-400 text-blue-400"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === "layers" && <LayersView data={data} />}
        {activeTab === "composed-verb" && <ComposedView content={data.verb} />}
        {activeTab === "composed-create" && <ComposedView content={data.create} />}
      </div>
    </div>
  );
}

function LayersView({ data }: { data: PromptData }) {
  return (
    <div className="space-y-3">
      <PromptSection title="World Style" content={data.world} fallback="(using default)" />
      <PromptSection
        title="World — Verb Guidance"
        content={data.worldVerb}
        fallback="(using default)"
      />
      <PromptSection
        title="World — Create Guidance"
        content={data.worldCreate}
        fallback="(using default)"
      />
      <PromptSection title="Region" content={data.region} fallback="(none)" />
      <PromptSection title="Room" content={data.room} fallback="(none)" />
    </div>
  );
}

function ComposedView({ content }: { content: string }) {
  return <pre className="whitespace-pre-wrap text-xs leading-relaxed text-gray-300">{content}</pre>;
}

function PromptSection({
  title,
  content,
  fallback,
}: {
  title: string;
  content: string | null;
  fallback: string;
}) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold text-gray-400">{title}</h3>
      {content ? (
        <pre className="whitespace-pre-wrap rounded bg-gray-800 p-2 text-xs leading-relaxed text-gray-300">
          {content}
        </pre>
      ) : (
        <span className="text-xs italic text-gray-500">{fallback}</span>
      )}
    </div>
  );
}
