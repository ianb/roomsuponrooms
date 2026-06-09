export function PropertyTable({
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
