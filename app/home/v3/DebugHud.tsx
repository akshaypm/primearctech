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
  return (
    <aside className="pa-debug" aria-hidden="true">
      {rows.map((row) => (
        <div key={row.id}>
          <b>{row.id}</b> {row.mode} <span>{row.reason}</span>
        </div>
      ))}
    </aside>
  );
}
