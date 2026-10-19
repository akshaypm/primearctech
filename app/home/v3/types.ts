export type Anchor = {
  id: string;
  x: number;
  y: number;
  label?: string;
  note?: string;
};

export type SceneOptions = {
  mobile: boolean;
  reducedMotion?: boolean;
};

export type SceneHandle = {
  setProgress: (value: number) => void;
  setHover?: (id: string | null) => void;
  resize: () => void;
  anchors: () => Anchor[];
  dispose: () => void;
  onChange?: () => void;
};
