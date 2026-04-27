import type { Node, Edge, Viewport } from "@xyflow/react";

export type NodeKind = "imageInput" | "prompt" | "generateImage";

export type ImageNodeData = {
  imageDataUrl: string | null;
  filename: string | null;
  label: string;
  uploading?: boolean;
  onChange: (id: string, dataUrl: string | null, filename: string | null) => void;
  onUploadingChange: (id: string, uploading: boolean) => void;
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
  ready: boolean;
  kind: NodeKind;
};

export type GenerateNodeSize = "1024x1024" | "1024x1536" | "1536x1024" | "auto";

export type GenerateNodeData = {
  prompt: string;
  status: "idle" | "running" | "done" | "error";
  resultUrl: string | null;
  error: string | null;
  references: ReferenceMention[];
  size?: GenerateNodeSize;
  label?: string;
  onPromptChange: (id: string, text: string) => void;
  onRun: (id: string) => void;
};

export type WorkspaceState = {
  id: string;
  name: string;
  nodes: Node[];
  edges: Edge[];
  viewport?: Viewport;
  updatedAt: number;
};

export type WorkspaceStore = {
  workspaces: WorkspaceState[];
  currentId: string;
};
