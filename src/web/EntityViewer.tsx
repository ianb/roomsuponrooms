import { useState, useEffect } from "react";
import { trpc } from "./trpc.js";
import { useStickyState } from "./use-sticky-state.js";

interface EntityListItem {
  id: string;
  name: string;
  tags: string[];
  location: string | null;
  hasChanges: boolean;
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
  const [playerRoomId, setPlayerRoomId] = useState<string | null>(null);
  const [details, setDetails] = useState<Map<string, EntityDetailInfo>>(new Map());
  const [showDiff, setShowDiff] = useStickyState("extenso:showDiff", false);
  const [othersExpanded, setOthersExpanded] = useState(false);

  useEffect(() => {
    trpc.entities.query({ gameId }).then((result) => {
      setEntities(result.items);
      setPlayerRoomId(result.playerRoomId);
    });
  }, [revision, gameId]);

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
    trpc.entities.query({ gameId }).then((result) => {
      setEntities(result.items);
      setPlayerRoomId(result.playerRoomId);
    });
    setDetails(new Map());
  }

  const roomEntities: EntityListItem[] = [];
  const otherEntities: EntityListItem[] = [];
  for (const e of entities) {
    if (e.id === playerRoomId || e.location === playerRoomId) {
      roomEntities.push(e);
    } else {
      otherEntities.push(e);
    }
  }

  const roomGrouped = groupByTag(roomEntities);
  const otherGrouped = groupByTag(otherEntities);

  return (
    <div className="flex h-full flex-col text-xs">
      <div className="flex items-center justify-between border-b border-content/15 px-3 py-2">
        <span className="font-bold text-content/70">Entities</span>
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1 text-content/40">
            <input
              type="checkbox"
              checked={showDiff}
              onChange={(e) => setShowDiff(e.target.checked)}
              className="accent-accent"
            />
            Diff
          </label>
          <button
            onClick={refreshEntities}
            className="text-content/40 hover:text-content/70"
            title="Refresh"
          >
            ↻
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="border-b border-content/15">
          <div className="px-3 py-1.5 text-[10px] font-bold tracking-wide text-accent uppercase">
            Current Room
          </div>
          <EntityGroup
            grouped={roomGrouped}
            selectedId={selectedId}
            details={details}
            showDiff={showDiff}
            onToggle={handleSelect}
          />
        </div>

        <div>
          <button
            onClick={() => setOthersExpanded(!othersExpanded)}
            className="flex w-full items-center gap-1 px-3 py-1.5 text-left text-[10px] font-bold tracking-wide text-content/40 uppercase hover:text-content/50"
          >
            <span>{othersExpanded ? "▾" : "▸"}</span>
            All Other Entities ({otherEntities.length})
          </button>
          {othersExpanded ? (
            <EntityGroup
              grouped={otherGrouped}
              selectedId={selectedId}
              details={details}
              showDiff={showDiff}
              onToggle={handleSelect}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function EntityGroup({
  grouped,
  selectedId,
  details,
  showDiff,
  onToggle,
}: {
  grouped: Record<string, EntityListItem[]>;
  selectedId: string | null;
  details: Map<string, EntityDetailInfo>;
  showDiff: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <>
      {Object.entries(grouped).map(([tag, items]) => (
        <div key={tag}>
          <div className="px-3 py-1 text-[10px] font-bold tracking-wide text-content/40 uppercase">
            {tag}
          </div>
          {items.map((e) => (
            <EntityRow
              key={e.id}
              entity={e}
              selected={e.id === selectedId}
              detail={details.get(e.id) || null}
              showDiff={showDiff}
              onToggle={() => onToggle(e.id)}
            />
          ))}
        </div>
      ))}
    </>
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
  const changedIndicator = showDiff && entity.hasChanges;
  return (
    <div className="border-b border-content/8">
      <button
        onClick={onToggle}
        className={`flex w-full items-center gap-1 px-3 py-1 text-left hover:bg-input ${
          selected ? "bg-input text-accent" : "text-content/70"
        }`}
      >
        <span className="text-content/25">{selected ? "▾" : "▸"}</span>
        {changedIndicator ? <span className="text-caution">●</span> : null}
        {entity.name !== entity.id && <span>{entity.name} </span>}
        <span className="font-mono text-content/25">{entity.id}</span>
      </button>
      {selected && detail !== null ? (
        <div className="bg-input/50 px-3 py-2">
          <div className="mb-1 flex flex-wrap gap-1">
            {detail.current.tags.map((tag) => (
              <span key={tag} className="rounded bg-input px-1.5 py-0.5 text-[10px] text-accent">
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
    return (
      <div className="text-content/25 italic">{showDiff ? "No changes" : "No properties"}</div>
    );
  }

  return (
    <table className="w-full">
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className={row.changed ? "bg-caution/10" : ""}>
            <td
              className={`pr-2 align-top font-bold ${
                row.removed
                  ? "text-removed line-through"
                  : row.added
                    ? "text-added"
                    : "text-content/50"
              }`}
            >
              {row.key}
            </td>
            <td className="text-content/70">{formatValue(row.value)}</td>
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
  const sorted: Record<string, EntityListItem[]> = {};
  const exitGroup = groups["exit"];
  for (const [tag, items] of Object.entries(groups)) {
    if (tag !== "exit") sorted[tag] = items;
  }
  if (exitGroup) sorted["exit"] = exitGroup;
  return sorted;
}
