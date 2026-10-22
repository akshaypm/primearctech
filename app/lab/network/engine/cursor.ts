import { damp } from "./path";

export type CursorLabel = "OPEN" | "PLAY" | "DRAG";

export type CursorState = {
  x: number;
  y: number;
  label: CursorLabel | null;
};

export function stepCursor(
  state: CursorState,
  pointerX: number,
  pointerY: number,
  snap: { x: number; y: number; label: CursorLabel } | null,
  dt: number,
): CursorState {
  const lambda = snap ? 22 : 14;
  return {
    x: damp(state.x, snap ? snap.x : pointerX, lambda, dt),
    y: damp(state.y, snap ? snap.y : pointerY, lambda, dt),
    label: snap ? snap.label : null,
  };
}

export function isCursorLabel(value: string | null | undefined): value is CursorLabel {
  return value === "OPEN" || value === "PLAY" || value === "DRAG";
}
