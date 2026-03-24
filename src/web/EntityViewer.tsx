import { useState, useEffect } from "react";
import { trpc } from "./trpc.js";

interface EntityListItem {
  id: string;
  name: string;
  tags: string[];
}

interface EntitySnapshot {
  id: string;
  tags: string[];
  properties: Record<string, unknown>;
}

interface EntityDetailInfo {
  current: EntitySnapshot;
  initial: EntitySnapshot | null;
}

export function EntityViewer({
  gameId,
  selectedId,
  onSelect,
  revision,
}: {
  gameId: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  revision: number;
}) {
  const [entities, setEntities] = useState<EntityListItem[]>([]);
  const [details, setDetails] = useState<Map<string, EntityDetailInfo>>(new Map());
  const [showDiff, setShowDiff] = useState(false);

  useEffect(() => {
    trpc.entities.query({ gameId }).then(setEntities);
  }, [revision, gameId]);

  // Re-fetch detail for the selected entity when it changes or the world updates
  useEffect(() => {
    if (!selectedId) return;
    trpc.entity.query({ gameId, id: selectedId }).then((result) => {
      if (result) {
        setDetails((prev) => new Map(prev).set(selectedId, result));
      }
    });
  }, [selectedId, revision, gameId]);

  function handleSelect(id: string): void {
    if (selectedId === id) {
      onSelect(null);
    } else {
      onSelect(id);
    }
  }

  function refreshEntities(): void {
    trpc.entities.query({ gameId }).then(setEntities);
    setDetails(new Map());
  }

  const grouped = groupByTag(entities);

  return (
    <div className="flex h-full flex-col text-xs">
      <div className="flex items-center justify-between border-b border-gray-700 px-3 py-2">
        <span className="font-bold text-gray-300">Entities</span>
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1 text-gray-500">
            <input
              type="checkbox"
              checked={showDiff}
              onChange={(e) => setShowDiff(e.target.checked)}
              className="accent-sky-500"
            />
            Diff
          </label>
          <button
            onClick={refreshEntities}
            className="text-gray-500 hover:text-gray-300"
            title="Refresh"
          >
            ↻
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {Object.entries(grouped).map(([tag, items]) => (
          <div key={tag}>
            <div className="px-3 py-1 text-[10px] font-bold tracking-wide text-gray-500 uppercase">
              {tag}
            </div>
            {items.map((e) => (
              <EntityRow
                key={e.id}
                entity={e}
                selected={e.id === selectedId}
                detail={details.get(e.id) || null}
                showDiff={showDiff}
                onToggle={() => handleSelect(e.id)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function EntityRow({
  entity,
  selected,
  detail,
  showDiff,
  onToggle,
}: {
  entity: EntityListItem;
  selected: boolean;
  detail: EntityDetailInfo | null;
  showDiff: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-gray-800/50">
      <button
        onClick={onToggle}
        className={`flex w-full items-center gap-1 px-3 py-1 text-left hover:bg-gray-800 ${
          selected ? "bg-gray-800 text-sky-400" : "text-gray-300"
        }`}
      >
        <span className="text-gray-600">{selected ? "▾" : "▸"}</span>
        {entity.name !== entity.id && <span>{entity.name} </span>}
        <span className="font-mono text-gray-600">{entity.id}</span>
      </button>
      {selected && detail !== null ? (
        <div className="bg-gray-850 px-3 py-2">
          <div className="mb-1 flex flex-wrap gap-1">
            {detail.current.tags.map((tag) => (
              <span
                key={tag}
                className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-sky-400"
              >
                {tag}
              </span>
            ))}
          </div>
          <PropertyTable
            current={detail.current.properties}
            initial={detail.initial ? detail.initial.properties : null}
            showDiff={showDiff}
          />
        </div>
      ) : null}
    </div>
  );
}

function PropertyTable({
  current,
  initial,
  showDiff,
}: {
  current: Record<string, unknown>;
  initial: Record<string, unknown> | null;
  showDiff: boolean;
}) {
  const allKeys = new Set([...Object.keys(current), ...(initial ? Object.keys(initial) : [])]);
  const sortedKeys = Array.from(allKeys).toSorted();

  const rows: Array<{
    key: string;
    value: unknown;
    changed: boolean;
    added: boolean;
    removed: boolean;
  }> = [];
  for (const key of sortedKeys) {
    const curVal = current[key];
    const initVal = initial ? initial[key] : undefined;
    const changed = initial !== null && JSON.stringify(curVal) !== JSON.stringify(initVal);
    const added = initial !== null && initVal === undefined && curVal !== undefined;
    const removed = initial !== null && curVal === undefined && initVal !== undefined;

    if (showDiff && !changed) continue;

    rows.push({ key, value: removed ? initVal : curVal, changed, added, removed });
  }

  if (rows.length === 0) {
    return <div className="text-gray-600 italic">{showDiff ? "No changes" : "No properties"}</div>;
  }

  return (
    <table className="w-full">
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className={row.changed ? "bg-yellow-900/20" : ""}>
            <td
              className={`pr-2 align-top font-bold ${
                row.removed
                  ? "text-red-500 line-through"
                  : row.added
                    ? "text-green-500"
                    : "text-gray-400"
              }`}
            >
              {row.key}
            </td>
            <td className="text-gray-300">{formatValue(row.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.join(", ");
  return JSON.stringify(value);
}

function groupByTag(entities: EntityListItem[]): Record<string, EntityListItem[]> {
  const groups: Record<string, EntityListItem[]> = {};
  for (const e of entities) {
    const tag = e.tags[0] || "other";
    if (!groups[tag]) groups[tag] = [];
    groups[tag].push(e);
  }
  return groups;
}
