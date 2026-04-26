export type ImageNodeData = {
  imageDataUrl: string | null;
  filename: string | null;
  label: string;
  onChange: (id: string, dataUrl: string | null, filename: string | null) => void;
};

export type PromptNodeData = {
  text: string;
  onChange: (id: string, text: string) => void;
};

export type GenerateNodeData = {
  status: "idle" | "running" | "done" | "error";
  resultUrl: string | null;
  error: string | null;
  onRun: (id: string) => void;
};
