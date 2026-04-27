import type { Node, Edge, Viewport } from "@xyflow/react";

export type NodeKind =
  | "imageInput"
  | "prompt"
  | "generateImage"
  | "settings"
  | "styleExtractor";

export type GenerateNodeSize = "1024x1024" | "1024x1536" | "1536x1024" | "auto";
export type GenerateNodeQuality = "low" | "medium" | "high" | "auto";
export type GenerateNodeBackground = "transparent" | "opaque" | "auto";
export type GenerateModel = "auto" | "gpt-image-1" | "gemini-2.5-flash-image";

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
  /** References injected from a downstream generate node (for read-only display). */
  inheritedRefs?: ReferenceMention[];
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

export type GenerateNodeData = {
  prompt: string;
  status: "idle" | "running" | "done" | "error";
  resultUrl: string | null;
  error: string | null;
  references: ReferenceMention[];
  size?: GenerateNodeSize;
  quality?: GenerateNodeQuality;
  background?: GenerateNodeBackground;
  model?: GenerateModel;
  label?: string;
  /** Settings inherited from a connected SettingsNode (display only — backend resolves). */
  inheritedSettings?: SettingsNodeData | null;
  onPromptChange: (id: string, text: string) => void;
  onRun: (id: string) => void;
};

export type SettingsNodeData = {
  label: string;
  model: GenerateModel;
  size: GenerateNodeSize;
  quality: GenerateNodeQuality;
  background: GenerateNodeBackground;
  /** Optional reference image (data URL) to inject into every connected generate node. */
  referenceImageDataUrl: string | null;
  referenceImageFilename: string | null;
  /** Optional plain-text reference (e.g. brand voice) to inject into the prompt. */
  textReference: string;
  /** Unified prompt prefix that wraps the downstream prompt. */
  unifiedPrompt: string;
};

export type StyleExtractorNodeData = {
  label: string;
  /** The professional prompt produced by analyzing the connected image. */
  text: string;
  status: "idle" | "running" | "done" | "error";
  error: string | null;
  /** Source image data URL, set automatically from the connected source node. */
  sourceImageDataUrl: string | null;
  sourceLabel: string | null;
  onExtract: (id: string) => void;
  onTextChange: (id: string, text: string) => void;
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
