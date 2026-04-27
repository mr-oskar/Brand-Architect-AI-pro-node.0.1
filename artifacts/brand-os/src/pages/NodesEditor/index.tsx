import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  reconnectEdge,
  type Node,
  type Edge,
  type NodeTypes,
  type Connection,
  type NodeChange,
  type EdgeChange,
  type Viewport,
  BackgroundVariant,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import ImageInputNode from "./ImageInputNode";
import PromptNode from "./PromptNode";
import GenerateImageNode from "./GenerateImageNode";
import SettingsNode from "./SettingsNode";
import StyleExtractorNode from "./StyleExtractorNode";
import Sidebar from "./Sidebar";
import CanvasControls from "./CanvasControls";
import { notifyError, notifySuccess } from "@/lib/apiError";
import type {
  GenerateModel,
  GenerateNodeBackground,
  GenerateNodeData,
  GenerateNodeQuality,
  GenerateNodeSize,
  ImageNodeData,
  PromptNodeData,
  ReferenceMention,
  SettingsNodeData,
  StyleExtractorNodeData,
} from "./types";
import {
  loadStore,
  saveStore,
  patchCurrentWorkspace,
  getCurrentWorkspace,
  addWorkspace,
  renameWorkspace,
  deleteWorkspace,
  switchWorkspace,
  duplicateWorkspace,
  defaultStarterNodes,
  urlToDataUrl,
} from "./storage";
import type { WorkspaceStore } from "./types";

const SIDEBAR_COLLAPSED_KEY = "nodes-editor-sidebar-collapsed";

function NodesEditorInner() {
  // ===== Workspace store =====
  const [store, setStore] = useState<WorkspaceStore>(() => loadStore());
  const current = getCurrentWorkspace(store);

  const [nodes, setNodes] = useState<Node[]>(current.nodes);
  const [edges, setEdges] = useState<Edge[]>(current.edges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const idCounter = useRef<number>(Date.now());
  const reconnectSuccessful = useRef<boolean>(true);
  const lastWsId = useRef<string>(current.id);
  const lastViewport = useRef<Viewport | undefined>(current.viewport);
  const dataUrlCache = useRef<Map<string, Promise<string>>>(new Map());

  // Reload when workspace switches
  useEffect(() => {
    if (lastWsId.current !== current.id) {
      lastWsId.current = current.id;
      setNodes(current.nodes);
      setEdges(current.edges);
      setSelectedNodeId(null);
      lastViewport.current = current.viewport;
      dataUrlCache.current = new Map();
    }
  }, [current.id, current.nodes, current.edges, current.viewport]);

  // Persist current workspace + store on changes
  const persist = useCallback(
    (ns: Node[], es: Edge[]) => {
      setStore((prev) => {
        const next = patchCurrentWorkspace(prev, { nodes: ns, edges: es });
        saveStore(next);
        return next;
      });
    },
    [],
  );

  const persistViewport = useCallback((vp: Viewport) => {
    lastViewport.current = vp;
    setStore((prev) => {
      const next = patchCurrentWorkspace(prev, { viewport: vp });
      saveStore(next);
      return next;
    });
  }, []);

  // ===== Node/edge change handlers =====
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => {
        const next = applyNodeChanges(changes, nds);
        // Track selection changes
        for (const c of changes) {
          if (c.type === "select") {
            if (c.selected) setSelectedNodeId(c.id);
            else
              setSelectedNodeId((curr) => (curr === c.id ? null : curr));
          }
          if (c.type === "remove") {
            setSelectedNodeId((curr) => (curr === c.id ? null : curr));
          }
        }
        persist(next, edges);
        return next;
      });
    },
    [edges, persist],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => {
        const next = applyEdgeChanges(changes, eds);
        persist(nodes, next);
        return next;
      });
    },
    [nodes, persist],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => {
        const next = addEdge(
          { ...connection, animated: true, markerEnd: { type: MarkerType.ArrowClosed } },
          eds,
        );
        persist(nodes, next);
        return next;
      });
    },
    [nodes, persist],
  );

  const onEdgeDoubleClick = useCallback(
    (_e: React.MouseEvent, edge: Edge) => {
      setEdges((eds) => {
        const next = eds.filter((x) => x.id !== edge.id);
        persist(nodes, next);
        return next;
      });
    },
    [nodes, persist],
  );

  const onReconnectStart = useCallback(() => {
    reconnectSuccessful.current = false;
  }, []);

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      reconnectSuccessful.current = true;
      setEdges((els) => {
        const next = reconnectEdge(oldEdge, newConnection, els);
        persist(nodes, next);
        return next;
      });
    },
    [nodes, persist],
  );

  const onReconnectEnd = useCallback(
    (_evt: MouseEvent | TouchEvent, edge: Edge) => {
      if (!reconnectSuccessful.current) {
        setEdges((eds) => {
          const next = eds.filter((e) => e.id !== edge.id);
          persist(nodes, next);
          return next;
        });
      }
      reconnectSuccessful.current = true;
    },
    [nodes, persist],
  );

  const updateNodeData = useCallback(
    (nodeId: string, patch: Record<string, unknown>) => {
      setNodes((nds) => {
        let next = nds;
        // Special key __position to also update position
        if ("__position" in patch) {
          const pos = patch.__position as { x: number; y: number };
          const rest = { ...patch };
          delete (rest as Record<string, unknown>).__position;
          next = nds.map((n) =>
            n.id === nodeId ? { ...n, position: pos, data: { ...n.data, ...rest } } : n,
          );
        } else {
          next = nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n));
        }
        persist(next, edges);
        return next;
      });
    },
    [edges, persist],
  );

  const handleImageChange = useCallback(
    (id: string, dataUrl: string | null, filename: string | null) => {
      updateNodeData(id, { imageDataUrl: dataUrl, filename });
    },
    [updateNodeData],
  );

  const handleImageUploadingChange = useCallback(
    (id: string, uploading: boolean) => {
      updateNodeData(id, { uploading });
    },
    [updateNodeData],
  );

  const handlePromptChange = useCallback(
    (id: string, text: string) => {
      updateNodeData(id, { text });
    },
    [updateNodeData],
  );

  const handleGeneratePromptChange = useCallback(
    (id: string, text: string) => {
      updateNodeData(id, { prompt: text });
    },
    [updateNodeData],
  );

  // ===== References per generate node =====
  // Image-input nodes AND generate-image nodes (whose result is an image) can be references.
  const referencesByGenId = useMemo(() => {
    const map = new Map<string, ReferenceMention[]>();
    const genNodes = nodes.filter((n) => n.type === "generateImage");
    for (const gen of genNodes) {
      const incoming = edges.filter(
        (e) => e.target === gen.id && (e.targetHandle === "references" || !e.targetHandle),
      );
      const refs: ReferenceMention[] = [];
      let idx = 1;
      for (const e of incoming) {
        const src = nodes.find((x) => x.id === e.source);
        if (!src) continue;
        if (src.type === "imageInput") {
          const data = src.data as ImageNodeData;
          const ready = !!data.imageDataUrl && !data.uploading;
          refs.push({
            id: src.id,
            label: data.label || `Reference ${idx}`,
            mention: `@ref${idx}`,
            thumbnail: data.imageDataUrl ?? null,
            ready,
            kind: "imageInput",
          });
          idx += 1;
        } else if (src.type === "generateImage") {
          const data = src.data as GenerateNodeData;
          const ready = data.status === "done" && !!data.resultUrl;
          refs.push({
            id: src.id,
            label: data.label || `Generated ${idx}`,
            mention: `@ref${idx}`,
            thumbnail: data.resultUrl ?? null,
            ready,
            kind: "generateImage",
          });
          idx += 1;
        }
      }
      map.set(gen.id, refs);
    }
    return map;
  }, [nodes, edges]);

  // ===== Settings inherited per node (from a SettingsNode connected via "settings" handle) =====
  const settingsByTargetId = useMemo(() => {
    const map = new Map<string, SettingsNodeData>();
    for (const e of edges) {
      const src = nodes.find((x) => x.id === e.source);
      if (!src || src.type !== "settings") continue;
      // accept any target — we treat connections from a settings source as "apply"
      map.set(e.target, src.data as SettingsNodeData);
    }
    return map;
  }, [nodes, edges]);

  // ===== Source image per StyleExtractor node (incoming on "image" handle) =====
  const styleExtractorSourceByNodeId = useMemo(() => {
    const map = new Map<string, { dataUrl: string | null; label: string | null; ready: boolean }>();
    const extractors = nodes.filter((n) => n.type === "styleExtractor");
    for (const ex of extractors) {
      const incoming = edges.find((e) => e.target === ex.id && (e.targetHandle === "image" || !e.targetHandle));
      if (!incoming) {
        map.set(ex.id, { dataUrl: null, label: null, ready: false });
        continue;
      }
      const src = nodes.find((n) => n.id === incoming.source);
      if (!src) {
        map.set(ex.id, { dataUrl: null, label: null, ready: false });
        continue;
      }
      if (src.type === "imageInput") {
        const data = src.data as ImageNodeData;
        map.set(ex.id, {
          dataUrl: data.imageDataUrl ?? null,
          label: data.label || "Reference",
          ready: !!data.imageDataUrl && !data.uploading,
        });
      } else if (src.type === "generateImage") {
        const data = src.data as GenerateNodeData;
        map.set(ex.id, {
          dataUrl: data.resultUrl ?? null,
          label: data.label || "Generated",
          ready: data.status === "done" && !!data.resultUrl,
        });
      } else {
        map.set(ex.id, { dataUrl: null, label: null, ready: false });
      }
    }
    return map;
  }, [nodes, edges]);

  // ===== Inherited refs per Prompt node (from a downstream Generate node) =====
  // When a prompt node's source is connected to a generate node's "prompt" handle,
  // surface the generate node's references inside the prompt node.
  const inheritedRefsByPromptId = useMemo(() => {
    const map = new Map<string, ReferenceMention[]>();
    const promptNodes = nodes.filter((n) => n.type === "prompt");
    for (const p of promptNodes) {
      const downstream = edges.find(
        (e) => e.source === p.id && e.targetHandle === "prompt",
      );
      if (!downstream) continue;
      const refs = referencesByGenId.get(downstream.target);
      if (refs && refs.length > 0) map.set(p.id, refs);
    }
    return map;
  }, [nodes, edges, referencesByGenId]);

  // ===== Run a generate node =====
  const runGenerate = useCallback(
    async (genNodeId: string) => {
      const genNode = nodes.find((n) => n.id === genNodeId);
      const inNodePrompt = ((genNode?.data as GenerateNodeData | undefined)?.prompt ?? "").trim();

      // Local fallback values
      const localSize: GenerateNodeSize =
        (genNode?.data as GenerateNodeData | undefined)?.size ?? "1024x1024";
      const localQuality: GenerateNodeQuality =
        (genNode?.data as GenerateNodeData | undefined)?.quality ?? "auto";
      const localBackground: GenerateNodeBackground =
        (genNode?.data as GenerateNodeData | undefined)?.background ?? "auto";
      const localModel: GenerateModel =
        (genNode?.data as GenerateNodeData | undefined)?.model ?? "auto";

      // Inherited Settings node (overrides local)
      const inh = settingsByTargetId.get(genNodeId) ?? null;
      const size: GenerateNodeSize = inh?.size ?? localSize;
      const quality: GenerateNodeQuality = inh?.quality ?? localQuality;
      const background: GenerateNodeBackground = inh?.background ?? localBackground;
      const model: GenerateModel = inh?.model ?? localModel;

      const refs = [...(referencesByGenId.get(genNodeId) ?? [])];

      // If a Settings node provides an extra reference image, treat it as a synthetic
      // ready-to-go reference so we can flow it through the same resolution path.
      const settingsRefDataUrl = inh?.referenceImageDataUrl ?? null;

      // Refuse to run if any "real" reference isn't ready yet.
      const notReady = refs.filter((r) => !r.ready);
      if (notReady.length > 0) {
        notifyError(
          "References not ready",
          null,
          "Wait until all reference images finish loading before running.",
        );
        return;
      }

      // Resolve all references to data URLs (fetch generated outputs as needed).
      let resolved: string[] = [];
      try {
        resolved = await Promise.all(
          refs.map(async (r) => {
            const sourceNode = nodes.find((x) => x.id === r.id);
            if (!sourceNode) throw new Error(`Reference ${r.mention} is missing.`);
            if (sourceNode.type === "imageInput") {
              const url = (sourceNode.data as ImageNodeData).imageDataUrl;
              if (!url || !url.startsWith("data:image/")) {
                throw new Error(`Reference ${r.mention} has no image yet.`);
              }
              return url;
            }
            // generateImage source — fetch its URL and convert to data URL
            const url = (sourceNode.data as GenerateNodeData).resultUrl;
            if (!url) throw new Error(`Reference ${r.mention} has no generated output yet.`);
            if (url.startsWith("data:image/")) return url;
            const cache = dataUrlCache.current;
            const cached = cache.get(url);
            if (cached) return cached;
            const p = urlToDataUrl(url).catch((err) => {
              cache.delete(url);
              throw err;
            });
            cache.set(url, p);
            return p;
          }),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to load references";
        updateNodeData(genNodeId, { status: "error", error: msg, resultUrl: null });
        notifyError("Could not prepare references", err, msg);
        return;
      }

      if (settingsRefDataUrl) resolved.push(settingsRefDataUrl);

      // Optional fallback: Prompt node OR StyleExtractor node connected to "prompt" handle.
      let prompt = inNodePrompt;
      if (!prompt) {
        const incoming = edges.filter((e) => e.target === genNodeId && e.targetHandle === "prompt");
        for (const e of incoming) {
          const n = nodes.find((x) => x.id === e.source);
          if (!n) continue;
          const text = (n.data as { text?: string }).text;
          if ((n.type === "prompt" || n.type === "styleExtractor") && typeof text === "string" && text.trim()) {
            prompt = text.trim();
            break;
          }
        }
      }

      if (!prompt) {
        notifyError(
          "No instructions",
          null,
          "Write a prompt inside the generate node, or connect an Instructions node to it.",
        );
        return;
      }

      // Inject Settings node's text reference + unified prompt prefix.
      const sections: string[] = [];
      if (inh?.unifiedPrompt?.trim()) sections.push(inh.unifiedPrompt.trim());
      if (inh?.textReference?.trim()) sections.push(`Style / brand reference:\n${inh.textReference.trim()}`);
      sections.push(prompt);
      const composedPrompt = sections.join("\n\n");

      // Replace @refN tokens with explicit references the model understands.
      const resolvedPrompt = composedPrompt.replace(/@ref(\d+)/g, (match, n) => {
        const idx = Number(n);
        if (Number.isFinite(idx) && idx >= 1 && idx <= resolved.length) {
          return `Reference Image #${idx}`;
        }
        return match;
      });

      updateNodeData(genNodeId, { status: "running", error: null, resultUrl: null });

      try {
        const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
        const res = await fetch(`${baseUrl}/api/nodes/generate-image`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            prompt: resolvedPrompt,
            referenceImages: resolved,
            size,
            quality,
            background,
            model,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
        if (!res.ok || !json.url) {
          const msg = json.error || `Generation failed (${res.status})`;
          updateNodeData(genNodeId, { status: "error", error: msg, resultUrl: null });
          notifyError("Generation failed", null, msg);
          return;
        }
        updateNodeData(genNodeId, { status: "done", resultUrl: json.url, error: null });
        notifySuccess("Image generated");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Network error";
        updateNodeData(genNodeId, { status: "error", error: msg, resultUrl: null });
        notifyError("Connection failed", err, msg);
      }
    },
    [edges, nodes, referencesByGenId, settingsByTargetId, updateNodeData],
  );

  // ===== Run a Style Extractor =====
  const runExtractStyle = useCallback(
    async (extractorId: string) => {
      const ex = nodes.find((n) => n.id === extractorId);
      if (!ex) return;
      const src = styleExtractorSourceByNodeId.get(extractorId);
      if (!src || !src.dataUrl || !src.ready) {
        notifyError(
          "No source image",
          null,
          "Connect a ready Image or Generate node to the extractor's left handle.",
        );
        return;
      }

      // Convert remote URL → data URL if needed
      let dataUrl = src.dataUrl;
      if (!dataUrl.startsWith("data:image/")) {
        try {
          const cache = dataUrlCache.current;
          const cached = cache.get(dataUrl);
          if (cached) dataUrl = await cached;
          else {
            const p = urlToDataUrl(dataUrl).catch((err) => {
              cache.delete(dataUrl);
              throw err;
            });
            cache.set(dataUrl, p);
            dataUrl = await p;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Could not load source image";
          updateNodeData(extractorId, { status: "error", error: msg });
          notifyError("Could not load image", err, msg);
          return;
        }
      }

      updateNodeData(extractorId, { status: "running", error: null });

      try {
        const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
        const res = await fetch(`${baseUrl}/api/nodes/extract-style`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ imageDataUrl: dataUrl }),
        });
        const json = (await res.json().catch(() => ({}))) as { prompt?: string; error?: string };
        if (!res.ok || !json.prompt) {
          const msg = json.error || `Extraction failed (${res.status})`;
          updateNodeData(extractorId, { status: "error", error: msg });
          notifyError("Style extraction failed", null, msg);
          return;
        }
        updateNodeData(extractorId, { status: "done", error: null, text: json.prompt });
        notifySuccess("Style prompt extracted");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Network error";
        updateNodeData(extractorId, { status: "error", error: msg });
        notifyError("Connection failed", err, msg);
      }
    },
    [nodes, styleExtractorSourceByNodeId, updateNodeData],
  );

  const handleStyleExtractorTextChange = useCallback(
    (id: string, text: string) => updateNodeData(id, { text }),
    [updateNodeData],
  );

  // Forward declarations so decoratedNodes can call delete/duplicate without
  // creating circular useCallback deps. The actual refs are filled in below.
  const deleteNodeRef = useRef<(id: string) => void>(() => {});
  const duplicateNodeRef = useRef<(id: string) => void>(() => {});
  const handleNodeDelete = useCallback((id: string) => deleteNodeRef.current(id), []);
  const handleNodeDuplicate = useCallback((id: string) => duplicateNodeRef.current(id), []);

  // ===== Decorate nodes with callbacks + computed refs =====
  const decoratedNodes = useMemo<Node[]>(() => {
    return nodes.map((n) => {
      const common = {
        onDelete: handleNodeDelete,
        onDuplicate: handleNodeDuplicate,
      };
      if (n.type === "imageInput") {
        return {
          ...n,
          data: {
            ...n.data,
            ...common,
            onChange: handleImageChange,
            onUploadingChange: handleImageUploadingChange,
          },
        };
      }
      if (n.type === "prompt") {
        return {
          ...n,
          data: {
            ...n.data,
            ...common,
            inheritedRefs: inheritedRefsByPromptId.get(n.id) ?? [],
            onChange: handlePromptChange,
          },
        };
      }
      if (n.type === "generateImage") {
        return {
          ...n,
          data: {
            ...n.data,
            ...common,
            references: referencesByGenId.get(n.id) ?? [],
            inheritedSettings: settingsByTargetId.get(n.id) ?? null,
            onPromptChange: handleGeneratePromptChange,
            onRun: runGenerate,
            onSettingsChange: updateNodeData,
          },
        };
      }
      if (n.type === "settings") {
        return {
          ...n,
          data: { ...n.data, ...common, onChange: updateNodeData },
        };
      }
      if (n.type === "styleExtractor") {
        const src = styleExtractorSourceByNodeId.get(n.id);
        return {
          ...n,
          data: {
            ...n.data,
            ...common,
            sourceImageDataUrl: src?.dataUrl ?? null,
            sourceLabel: src?.label ?? null,
            onExtract: runExtractStyle,
            onTextChange: handleStyleExtractorTextChange,
          },
        };
      }
      return n;
    });
  }, [
    nodes,
    referencesByGenId,
    settingsByTargetId,
    styleExtractorSourceByNodeId,
    inheritedRefsByPromptId,
    handleImageChange,
    handleImageUploadingChange,
    handlePromptChange,
    handleGeneratePromptChange,
    runGenerate,
    runExtractStyle,
    handleStyleExtractorTextChange,
    handleNodeDelete,
    handleNodeDuplicate,
    updateNodeData,
  ]);

  const nodeTypes = useMemo<NodeTypes>(
    () => ({
      imageInput: ImageInputNode,
      prompt: PromptNode,
      generateImage: GenerateImageNode,
      settings: SettingsNode,
      styleExtractor: StyleExtractorNode,
    }),
    [],
  );

  // ===== Add / remove / duplicate node helpers =====
  const nextId = (prefix: string) => {
    idCounter.current += 1;
    return `${prefix}-${idCounter.current}`;
  };

  const insertNode = useCallback(
    (newNode: Node) => {
      setNodes((nds) => {
        const next = [...nds, newNode];
        persist(next, edges);
        return next;
      });
      setSelectedNodeId(newNode.id);
    },
    [edges, persist],
  );

  const addImageNode = useCallback(() => {
    const id = nextId("img");
    const count = nodes.filter((n) => n.type === "imageInput").length + 1;
    insertNode({
      id,
      type: "imageInput",
      position: { x: 100 + Math.random() * 80, y: 100 + Math.random() * 220 },
      data: { imageDataUrl: null, filename: null, label: `Reference ${count}` },
    });
  }, [insertNode, nodes]);

  const addPromptNode = useCallback(() => {
    const id = nextId("prompt");
    insertNode({
      id,
      type: "prompt",
      position: { x: 420 + Math.random() * 60, y: 220 + Math.random() * 80 },
      data: { text: "" },
    });
  }, [insertNode]);

  const addGenerateNode = useCallback(() => {
    const id = nextId("gen");
    insertNode({
      id,
      type: "generateImage",
      position: { x: 720 + Math.random() * 60, y: 160 + Math.random() * 80 },
      data: {
        prompt: "",
        status: "idle",
        resultUrl: null,
        error: null,
        size: "1024x1024",
        quality: "auto",
        background: "auto",
        model: "auto",
        label: "Generate",
      },
    });
  }, [insertNode]);

  const addSettingsNode = useCallback(() => {
    const id = nextId("settings");
    insertNode({
      id,
      type: "settings",
      position: { x: 360 + Math.random() * 60, y: 460 + Math.random() * 80 },
      data: {
        label: "Settings",
        model: "auto",
        size: "1024x1024",
        quality: "auto",
        background: "auto",
        referenceImageDataUrl: null,
        referenceImageFilename: null,
        textReference: "",
        unifiedPrompt: "",
      } as SettingsNodeData,
    });
  }, [insertNode]);

  const addStyleExtractorNode = useCallback(() => {
    const id = nextId("style");
    insertNode({
      id,
      type: "styleExtractor",
      position: { x: 420 + Math.random() * 60, y: 320 + Math.random() * 80 },
      data: {
        label: "Style Extractor",
        text: "",
        status: "idle",
        error: null,
        sourceImageDataUrl: null,
        sourceLabel: null,
      } as Omit<StyleExtractorNodeData, "onExtract" | "onTextChange">,
    });
  }, [insertNode]);

  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => {
        const nextNodes = nds.filter((n) => n.id !== nodeId);
        setEdges((eds) => {
          const nextEdges = eds.filter((e) => e.source !== nodeId && e.target !== nodeId);
          persist(nextNodes, nextEdges);
          return nextEdges;
        });
        return nextNodes;
      });
      setSelectedNodeId((c) => (c === nodeId ? null : c));
    },
    [persist],
  );

  const duplicateNode = useCallback(
    (nodeId: string) => {
      const src = nodes.find((n) => n.id === nodeId);
      if (!src) return;
      const id = nextId(src.type ?? "node");
      // Strip out callback fields so we don't carry decorator references.
      const cleanData: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(src.data ?? {})) {
        if (typeof v === "function") continue;
        if (k === "references" || k === "inheritedSettings" || k === "inheritedRefs" || k === "sourceImageDataUrl" || k === "sourceLabel") continue;
        cleanData[k] = v;
      }
      const copy: Node = {
        ...src,
        id,
        position: { x: src.position.x + 32, y: src.position.y + 32 },
        selected: false,
        data: cleanData,
      };
      insertNode(copy);
    },
    [insertNode, nodes],
  );

  // Wire the forward-declared refs so the in-node action buttons stay current.
  useEffect(() => {
    deleteNodeRef.current = deleteNode;
    duplicateNodeRef.current = duplicateNode;
  }, [deleteNode, duplicateNode]);

  const deleteEdge = useCallback(
    (edgeId: string) => {
      setEdges((eds) => {
        const next = eds.filter((e) => e.id !== edgeId);
        persist(nodes, next);
        return next;
      });
    },
    [nodes, persist],
  );

  const resetCanvas = useCallback(() => {
    const { nodes: ns, edges: es } = defaultStarterNodes();
    setNodes(ns);
    setEdges(es);
    setSelectedNodeId(null);
    persist(ns, es);
  }, [persist]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedNodeId) {
        e.preventDefault();
        deleteNode(selectedNodeId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteNode, selectedNodeId]);

  // ===== Workspace controls =====
  const onCreateWorkspace = useCallback((name: string) => {
    setStore((prev) => {
      const next = addWorkspace(prev, name);
      saveStore(next);
      return next;
    });
  }, []);
  const onRenameWorkspace = useCallback((id: string, name: string) => {
    setStore((prev) => {
      const next = renameWorkspace(prev, id, name);
      saveStore(next);
      return next;
    });
  }, []);
  const onDeleteWorkspace = useCallback((id: string) => {
    setStore((prev) => {
      const next = deleteWorkspace(prev, id);
      saveStore(next);
      return next;
    });
  }, []);
  const onSwitchWorkspace = useCallback((id: string) => {
    setStore((prev) => {
      const next = switchWorkspace(prev, id);
      saveStore(next);
      return next;
    });
  }, []);
  const onDuplicateWorkspace = useCallback((id: string) => {
    setStore((prev) => {
      const next = duplicateWorkspace(prev, id);
      saveStore(next);
      return next;
    });
  }, []);

  // ===== Sidebar collapsed state =====
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? "1" : "0");
    } catch {}
  }, [sidebarCollapsed]);

  const selectedNode = useMemo(
    () => (selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) ?? null : null),
    [nodes, selectedNodeId],
  );

  const workspaceList = useMemo(
    () => store.workspaces.map((w) => ({ id: w.id, name: w.name })),
    [store.workspaces],
  );

  return (
    <div className="h-screen w-full flex flex-col bg-[#0b0d12] relative">
      {/* Top header */}
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-white/[0.06] bg-[#0d0f15]/85 backdrop-blur-xl z-30">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link
            href="/"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/80 hover:text-foreground hover:bg-white/5 transition-colors flex-shrink-0"
            data-testid="link-back-dashboard"
            title="Back to dashboard"
          >
            <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
          </Link>
          <div className="w-px h-5 bg-white/[0.08]" />
          <div className="min-w-0 flex items-center gap-2">
            <span className="text-[12px] font-medium text-foreground/95 tracking-tight">Nodes</span>
            <span className="text-muted-foreground/35">/</span>
            <span className="text-[11.5px] text-foreground/85 truncate" data-testid="text-current-workspace">
              {current.name}
            </span>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-3 text-[9.5px] uppercase tracking-wider text-muted-foreground/55 font-medium">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shadow-[0_0_6px_1px_rgba(56,189,248,0.45)]" />
            Reference
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-300 shadow-[0_0_6px_1px_rgba(252,211,77,0.45)]" />
            Prompt
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#a78bfa] shadow-[0_0_6px_1px_rgba(167,139,250,0.45)]" />
            Generate
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 shadow-[0_0_6px_1px_rgba(110,231,183,0.45)]" />
            Settings
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-300 shadow-[0_0_6px_1px_rgba(240,171,252,0.45)]" />
            Style Extractor
          </span>
        </div>
      </div>

      {/* Body: sidebar + canvas */}
      <div className="flex-1 min-h-0 flex relative">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
          workspaces={workspaceList}
          currentWorkspaceId={current.id}
          onSwitchWorkspace={onSwitchWorkspace}
          onCreateWorkspace={onCreateWorkspace}
          onRenameWorkspace={onRenameWorkspace}
          onDeleteWorkspace={onDeleteWorkspace}
          onDuplicateWorkspace={onDuplicateWorkspace}
          onAddImage={addImageNode}
          onAddPrompt={addPromptNode}
          onAddGenerate={addGenerateNode}
          onAddSettings={addSettingsNode}
          onAddStyleExtractor={addStyleExtractorNode}
          onResetCanvas={resetCanvas}
          selectedNode={selectedNode}
          onUpdateNodeData={updateNodeData}
          onDeleteNode={deleteNode}
          onDuplicateNode={duplicateNode}
          edges={edges}
          onDeleteEdge={deleteEdge}
        />

        {/* Canvas */}
        <div className="flex-1 min-w-0 relative">
          <ReactFlow
            nodes={decoratedNodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onEdgeDoubleClick={onEdgeDoubleClick}
            onReconnect={onReconnect}
            onReconnectStart={onReconnectStart}
            onReconnectEnd={onReconnectEnd}
            onMoveEnd={(_e, vp) => persistViewport(vp)}
            onPaneClick={() => setSelectedNodeId(null)}
            edgesReconnectable={true}
            nodeTypes={nodeTypes}
            defaultViewport={lastViewport.current}
            fitView={!lastViewport.current}
            fitViewOptions={{ padding: 0.2 }}
            colorMode="dark"
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{ animated: true, style: { strokeWidth: 1.5 } }}
            minZoom={0.2}
            maxZoom={3}
            deleteKeyCode={null}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#1c1f2b" />
            <MiniMap
              pannable
              zoomable
              position="bottom-right"
              className="!bg-[#13151c]/85 !border !border-white/10 !rounded-xl backdrop-blur-xl shadow-[0_8px_32px_-8px_rgba(0,0,0,0.7)] overflow-hidden"
              maskColor="rgba(11,13,18,0.7)"
              nodeColor={(n) => {
                if (n.type === "imageInput") return "#38bdf8";
                if (n.type === "prompt") return "#fcd34d";
                if (n.type === "generateImage") return "#a78bfa";
                if (n.type === "settings") return "#6ee7b7";
                if (n.type === "styleExtractor") return "#f0abfc";
                return "#6b7280";
              }}
              nodeStrokeWidth={0}
            />
          </ReactFlow>
          <CanvasControls />
        </div>
      </div>
    </div>
  );
}

export default function NodesEditor() {
  return (
    <ReactFlowProvider>
      <NodesEditorInner />
    </ReactFlowProvider>
  );
}
