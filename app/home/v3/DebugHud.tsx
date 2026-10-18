"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { debugEnabled, debugSnapshot, type DebugRow } from "./gl-host";

export function DebugHud() {
  const on = useSyncExternalStore(() => () => {}, debugEnabled, () => false);
  const [rows, setRows] = useState<DebugRow[]>([]);

  useEffect(() => {
    if (!on) return;
    const tick = () => setRows(debugSnapshot());
    const kick = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 300);
    return () => {
      window.clearTimeout(kick);
      window.clearInterval(id);
    };
  }, [on]);

  if (!on) return null;
  const rank = (row: DebugRow) => (row.mode === "live" ? 0 : row.id === "fps" ? 1 : row.id === "renderer" ? 2 : 3);
  const ordered = [...rows].sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
  return (
    <aside className="pa-debug" aria-hidden="true">
      {ordered.map((row) => (
        <div key={row.id}>
          <b>{row.id}</b> {row.mode} <span>{row.reason}</span>
        </div>
      ))}
    </aside>
  );
}
