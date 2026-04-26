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

export type ReferenceMention = {
  id: string;
  label: string;
  mention: string;
  thumbnail: string | null;
};

export type GenerateNodeData = {
  prompt: string;
  status: "idle" | "running" | "done" | "error";
  resultUrl: string | null;
  error: string | null;
  references: ReferenceMention[];
  onPromptChange: (id: string, text: string) => void;
  onRun: (id: string) => void;
};
