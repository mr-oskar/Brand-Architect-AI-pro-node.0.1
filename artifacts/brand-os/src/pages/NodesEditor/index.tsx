import { useCallback, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type NodeTypes,
  type Connection,
  type NodeChange,
  type EdgeChange,
  BackgroundVariant,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ImagePlus, FileText, Sparkles, Plus, RotateCcw, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import ImageInputNode from "./ImageInputNode";
import PromptNode from "./PromptNode";
import GenerateImageNode from "./GenerateImageNode";
import { notifyError, notifySuccess } from "@/lib/apiError";

const STORAGE_KEY = "nodes-editor-graph-v1";

const initialNodes: Node[] = [
  {
    id: "img-1",
    type: "imageInput",
    position: { x: 80, y: 80 },
    data: { imageDataUrl: null, filename: null, label: "Inspiration 1" },
  },
  {
    id: "img-2",
    type: "imageInput",
    position: { x: 80, y: 360 },
    data: { imageDataUrl: null, filename: null, label: "Inspiration 2" },
  },
  {
    id: "prompt-1",
    type: "prompt",
    position: { x: 420, y: 220 },
    data: { text: "حوّل الصور المرفقة إلى أسلوب فني موحّد، احتفظ بالتكوين الأصلي." },
  },
  {
    id: "gen-1",
    type: "generateImage",
    position: { x: 820, y: 160 },
    data: { status: "idle", resultUrl: null, error: null },
  },
];

const initialEdges: Edge[] = [
  { id: "e1", source: "img-1", target: "gen-1", targetHandle: "references", animated: true, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: "e2", source: "img-2", target: "gen-1", targetHandle: "references", animated: true, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: "e3", source: "prompt-1", target: "gen-1", targetHandle: "prompt", animated: true, markerEnd: { type: MarkerType.ArrowClosed } },
];

function loadFromStorage(): { nodes: Node[]; edges: Edge[] } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.nodes) && Array.isArray(parsed?.edges)) {
      return { nodes: parsed.nodes, edges: parsed.edges };
    }
  } catch {}
  return null;
}

function saveToStorage(nodes: Node[], edges: Edge[]) {
  try {
    // Drop large image data URLs from persistence to keep localStorage small.
    const trimmed = nodes.map((n) => {
      if (n.type === "imageInput") {
        return { ...n, data: { ...n.data, imageDataUrl: null } };
      }
      if (n.type === "generateImage") {
        return { ...n, data: { ...n.data, status: "idle", resultUrl: null, error: null } };
      }
      return n;
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes: trimmed, edges }));
  } catch {}
}

function NodesEditorInner() {
  const [nodes, setNodes] = useState<Node[]>(() => loadFromStorage()?.nodes ?? initialNodes);
  const [edges, setEdges] = useState<Edge[]>(() => loadFromStorage()?.edges ?? initialEdges);
  const idCounter = useRef<number>(Date.now());

  const persist = useCallback((ns: Node[], es: Edge[]) => {
    saveToStorage(ns, es);
  }, []);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => {
        const next = applyNodeChanges(changes, nds);
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
        const next = addEdge({ ...connection, animated: true, markerEnd: { type: MarkerType.ArrowClosed } }, eds);
        persist(nodes, next);
        return next;
      });
    },
    [nodes, persist],
  );

  const updateNodeData = useCallback((nodeId: string, patch: Record<string, unknown>) => {
    setNodes((nds) => {
      const next = nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n));
      persist(next, edges);
      return next;
    });
  }, [edges, persist]);

  const handleImageChange = useCallback(
    (id: string, dataUrl: string | null, filename: string | null) => {
      updateNodeData(id, { imageDataUrl: dataUrl, filename });
    },
    [updateNodeData],
  );

  const handlePromptChange = useCallback(
    (id: string, text: string) => {
      updateNodeData(id, { text });
    },
    [updateNodeData],
  );

  const runGenerate = useCallback(
    async (genNodeId: string) => {
      // Resolve connected references and prompt from current edges/nodes
      const incoming = edges.filter((e) => e.target === genNodeId);
      const refIds = incoming.filter((e) => e.targetHandle === "references" || !e.targetHandle).map((e) => e.source);
      const promptIds = incoming.filter((e) => e.targetHandle === "prompt").map((e) => e.source);

      const refImages: string[] = [];
      for (const sid of refIds) {
        const n = nodes.find((x) => x.id === sid);
        const url = (n?.data as { imageDataUrl?: string | null } | undefined)?.imageDataUrl;
        if (n?.type === "imageInput" && typeof url === "string" && url.startsWith("data:image/")) {
          refImages.push(url);
        }
      }

      let prompt = "";
      for (const pid of promptIds) {
        const n = nodes.find((x) => x.id === pid);
        const text = (n?.data as { text?: string } | undefined)?.text;
        if (n?.type === "prompt" && typeof text === "string" && text.trim()) {
          prompt = text.trim();
          break;
        }
      }

      if (!prompt) {
        notifyError("لا توجد تعليمات", null, "صل عقدة Instructions بعقدة التوليد وأضف نص تعليمات.");
        return;
      }

      updateNodeData(genNodeId, { status: "running", error: null, resultUrl: null });

      try {
        const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
        const res = await fetch(`${baseUrl}/api/nodes/generate-image`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ prompt, referenceImages: refImages }),
        });
        const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
        if (!res.ok || !json.url) {
          const msg = json.error || `فشل التوليد (${res.status})`;
          updateNodeData(genNodeId, { status: "error", error: msg, resultUrl: null });
          notifyError("فشل التوليد", null, msg);
          return;
        }
        updateNodeData(genNodeId, { status: "done", resultUrl: json.url, error: null });
        notifySuccess("تم توليد الصورة");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Network error";
        updateNodeData(genNodeId, { status: "error", error: msg, resultUrl: null });
        notifyError("فشل الاتصال", err, msg);
      }
    },
    [edges, nodes, updateNodeData],
  );

  // Wire callbacks into node data so child components can call them
  const decoratedNodes = useMemo<Node[]>(() => {
    return nodes.map((n) => {
      if (n.type === "imageInput") {
        return { ...n, data: { ...n.data, onChange: handleImageChange } };
      }
      if (n.type === "prompt") {
        return { ...n, data: { ...n.data, onChange: handlePromptChange } };
      }
      if (n.type === "generateImage") {
        return { ...n, data: { ...n.data, onRun: runGenerate } };
      }
      return n;
    });
  }, [nodes, handleImageChange, handlePromptChange, runGenerate]);

  const nodeTypes = useMemo<NodeTypes>(
    () => ({
      imageInput: ImageInputNode,
      prompt: PromptNode,
      generateImage: GenerateImageNode,
    }),
    [],
  );

  const nextId = (prefix: string) => {
    idCounter.current += 1;
    return `${prefix}-${idCounter.current}`;
  };

  const addImageNode = () => {
    const id = nextId("img");
    const count = nodes.filter((n) => n.type === "imageInput").length + 1;
    const newNode: Node = {
      id,
      type: "imageInput",
      position: { x: 80 + Math.random() * 60, y: 80 + Math.random() * 200 },
      data: { imageDataUrl: null, filename: null, label: `Inspiration ${count}` },
    };
    setNodes((nds) => {
      const next = [...nds, newNode];
      persist(next, edges);
      return next;
    });
  };

  const addPromptNode = () => {
    const id = nextId("prompt");
    const newNode: Node = {
      id,
      type: "prompt",
      position: { x: 420 + Math.random() * 60, y: 220 + Math.random() * 80 },
      data: { text: "" },
    };
    setNodes((nds) => {
      const next = [...nds, newNode];
      persist(next, edges);
      return next;
    });
  };

  const addGenerateNode = () => {
    const id = nextId("gen");
    const newNode: Node = {
      id,
      type: "generateImage",
      position: { x: 820 + Math.random() * 60, y: 160 + Math.random() * 80 },
      data: { status: "idle", resultUrl: null, error: null },
    };
    setNodes((nds) => {
      const next = [...nds, newNode];
      persist(next, edges);
      return next;
    });
  };

  const resetCanvas = () => {
    if (!confirm("هل تريد إعادة ضبط لوحة العقد؟ سيتم حذف كل التغييرات.")) return;
    setNodes(initialNodes);
    setEdges(initialEdges);
    saveToStorage(initialNodes, initialEdges);
  };

  return (
    <div className="h-screen w-full flex flex-col bg-[#0a0a14]">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-border bg-card/50 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            data-testid="link-back-dashboard"
            title="العودة إلى لوحة التحكم"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-base font-bold text-foreground tracking-tight">Nodes</h1>
            <p className="text-[11px] text-muted-foreground">محرر مرئي لتوليد الصور بالذكاء الاصطناعي</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={addImageNode}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-[11px] text-foreground"
            data-testid="button-add-image-node"
          >
            <ImagePlus className="w-3.5 h-3.5 text-cyan-500" />
            <Plus className="w-3 h-3" />
            صورة
          </button>
          <button
            onClick={addPromptNode}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-[11px] text-foreground"
            data-testid="button-add-prompt-node"
          >
            <FileText className="w-3.5 h-3.5 text-amber-500" />
            <Plus className="w-3 h-3" />
            تعليمات
          </button>
          <button
            onClick={addGenerateNode}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-[11px] text-foreground"
            data-testid="button-add-generate-node"
          >
            <Sparkles className="w-3.5 h-3.5 text-violet-500" />
            <Plus className="w-3 h-3" />
            توليد
          </button>
          <div className="w-px h-5 bg-border mx-1" />
          <button
            onClick={resetCanvas}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-[11px] text-muted-foreground hover:text-foreground"
            data-testid="button-reset-canvas"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            إعادة ضبط
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 min-h-0">
        <ReactFlow
          nodes={decoratedNodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          colorMode="dark"
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ animated: true, style: { strokeWidth: 1.5 } }}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#1f2233" />
          <Controls className="!bg-card !border-border" />
          <MiniMap pannable zoomable className="!bg-card !border-border" maskColor="rgba(0,0,0,0.6)" nodeColor={(n) => {
            if (n.type === "imageInput") return "#06b6d4";
            if (n.type === "prompt") return "#f59e0b";
            if (n.type === "generateImage") return "#8b5cf6";
            return "#6b7280";
          }} />
        </ReactFlow>
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
