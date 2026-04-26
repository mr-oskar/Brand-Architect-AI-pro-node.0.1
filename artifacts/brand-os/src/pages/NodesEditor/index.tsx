import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
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
  BackgroundVariant,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ImagePlus, FileText, Sparkles, Plus, RotateCcw, ArrowLeft, GripHorizontal, Minus, X } from "lucide-react";
import { Link } from "wouter";
import ImageInputNode from "./ImageInputNode";
import PromptNode from "./PromptNode";
import GenerateImageNode from "./GenerateImageNode";
import { notifyError, notifySuccess } from "@/lib/apiError";
import type { ReferenceMention } from "./types";

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
    id: "gen-1",
    type: "generateImage",
    position: { x: 520, y: 160 },
    data: {
      prompt: "حوّل المراجع إلى أسلوب فني موحّد، استخدم @ref1 كقاعدة وأضف ألوان @ref2.",
      status: "idle",
      resultUrl: null,
      error: null,
    },
  },
];

const initialEdges: Edge[] = [
  { id: "e1", source: "img-1", target: "gen-1", targetHandle: "references", animated: true, markerEnd: { type: MarkerType.ArrowClosed } },
  { id: "e2", source: "img-2", target: "gen-1", targetHandle: "references", animated: true, markerEnd: { type: MarkerType.ArrowClosed } },
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
  const reconnectSuccessful = useRef<boolean>(true);

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

  // Edge disconnect: double-click to delete
  const onEdgeDoubleClick = useCallback((_e: React.MouseEvent, edge: Edge) => {
    setEdges((eds) => {
      const next = eds.filter((x) => x.id !== edge.id);
      persist(nodes, next);
      return next;
    });
  }, [nodes, persist]);

  // Edge disconnect: drag the edge endpoint off to delete it
  const onReconnectStart = useCallback(() => {
    reconnectSuccessful.current = false;
  }, []);

  const onReconnect = useCallback((oldEdge: Edge, newConnection: Connection) => {
    reconnectSuccessful.current = true;
    setEdges((els) => {
      const next = reconnectEdge(oldEdge, newConnection, els);
      persist(nodes, next);
      return next;
    });
  }, [nodes, persist]);

  const onReconnectEnd = useCallback((_evt: MouseEvent | TouchEvent, edge: Edge) => {
    if (!reconnectSuccessful.current) {
      setEdges((eds) => {
        const next = eds.filter((e) => e.id !== edge.id);
        persist(nodes, next);
        return next;
      });
    }
    reconnectSuccessful.current = true;
  }, [nodes, persist]);

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

  const handleGeneratePromptChange = useCallback(
    (id: string, text: string) => {
      updateNodeData(id, { prompt: text });
    },
    [updateNodeData],
  );

  // Compute connected references for each generate node, in deterministic edge order.
  const referencesByGenId = useMemo(() => {
    const map = new Map<string, ReferenceMention[]>();
    const genNodes = nodes.filter((n) => n.type === "generateImage");
    for (const gen of genNodes) {
      const incoming = edges.filter((e) => e.target === gen.id && (e.targetHandle === "references" || !e.targetHandle));
      const refs: ReferenceMention[] = [];
      let idx = 1;
      for (const e of incoming) {
        const src = nodes.find((x) => x.id === e.source);
        if (!src || src.type !== "imageInput") continue;
        const data = src.data as { label?: string; imageDataUrl?: string | null };
        refs.push({
          id: src.id,
          label: data.label || `Inspiration ${idx}`,
          mention: `@ref${idx}`,
          thumbnail: data.imageDataUrl ?? null,
        });
        idx += 1;
      }
      map.set(gen.id, refs);
    }
    return map;
  }, [nodes, edges]);

  const runGenerate = useCallback(
    async (genNodeId: string) => {
      const genNode = nodes.find((n) => n.id === genNodeId);
      const inNodePrompt = ((genNode?.data as { prompt?: string } | undefined)?.prompt ?? "").trim();

      // Resolve references in the same order as the chips shown in the node.
      const refs = referencesByGenId.get(genNodeId) ?? [];
      const refImages: string[] = [];
      for (const r of refs) {
        const n = nodes.find((x) => x.id === r.id);
        const url = (n?.data as { imageDataUrl?: string | null } | undefined)?.imageDataUrl;
        if (typeof url === "string" && url.startsWith("data:image/")) {
          refImages.push(url);
        }
      }

      // Optional external prompt fallback (legacy Prompt node).
      let prompt = inNodePrompt;
      if (!prompt) {
        const incoming = edges.filter((e) => e.target === genNodeId && e.targetHandle === "prompt");
        for (const e of incoming) {
          const n = nodes.find((x) => x.id === e.source);
          const text = (n?.data as { text?: string } | undefined)?.text;
          if (n?.type === "prompt" && typeof text === "string" && text.trim()) {
            prompt = text.trim();
            break;
          }
        }
      }

      if (!prompt) {
        notifyError("لا توجد تعليمات", null, "اكتب البرومت داخل عقدة التوليد أو وصّل عقدة Instructions بها.");
        return;
      }

      // Replace @refN tokens with explicit references the model understands.
      const resolvedPrompt = prompt.replace(/@ref(\d+)/g, (match, n) => {
        const idx = Number(n);
        if (Number.isFinite(idx) && idx >= 1 && idx <= refImages.length) {
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
          body: JSON.stringify({ prompt: resolvedPrompt, referenceImages: refImages }),
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
    [edges, nodes, referencesByGenId, updateNodeData],
  );

  // Wire callbacks + computed reference lists into node data
  const decoratedNodes = useMemo<Node[]>(() => {
    return nodes.map((n) => {
      if (n.type === "imageInput") {
        return { ...n, data: { ...n.data, onChange: handleImageChange } };
      }
      if (n.type === "prompt") {
        return { ...n, data: { ...n.data, onChange: handlePromptChange } };
      }
      if (n.type === "generateImage") {
        return {
          ...n,
          data: {
            ...n.data,
            references: referencesByGenId.get(n.id) ?? [],
            onPromptChange: handleGeneratePromptChange,
            onRun: runGenerate,
          },
        };
      }
      return n;
    });
  }, [nodes, referencesByGenId, handleImageChange, handlePromptChange, handleGeneratePromptChange, runGenerate]);

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
      data: { prompt: "", status: "idle", resultUrl: null, error: null },
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

  // ===== Floating, draggable, collapsible toolbar =====
  const [toolbarOffset, setToolbarOffset] = useState<{ x: number; y: number }>(() => {
    try {
      const raw = localStorage.getItem("nodes-editor-toolbar-offset");
      if (raw) return JSON.parse(raw);
    } catch {}
    return { x: 0, y: 0 };
  });
  const [collapsed, setCollapsed] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);

  useEffect(() => {
    try { localStorage.setItem("nodes-editor-toolbar-offset", JSON.stringify(toolbarOffset)); } catch {}
  }, [toolbarOffset]);

  const onDragStart = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: toolbarOffset.x,
      baseY: toolbarOffset.y,
    };
  };
  const onDragMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setToolbarOffset({
      x: dragRef.current.baseX + (e.clientX - dragRef.current.startX),
      y: dragRef.current.baseY + (e.clientY - dragRef.current.startY),
    });
  };
  const onDragEnd = (e: React.PointerEvent) => {
    if (dragRef.current) {
      try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    }
    dragRef.current = null;
  };
  const resetToolbarPos = () => setToolbarOffset({ x: 0, y: 0 });

  return (
    <div className="h-screen w-full flex flex-col bg-[#0a0a14] relative">
      {/* Top header */}
      <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-border bg-card/50 backdrop-blur z-20">
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
        <div className="hidden md:flex items-center gap-3 text-[10px] text-muted-foreground/70">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" /> Reference
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-500" /> Generate
          </span>
          <span className="text-[10px] text-muted-foreground/50">دبل كليك على وصلة لفصلها · أو اسحب طرفها</span>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 min-h-0 relative">
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
          edgesReconnectable={true}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          colorMode="dark"
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ animated: true, style: { strokeWidth: 1.5 } }}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#1f2233" />
          <Controls className="!bg-card !border-border" position="top-right" />
          <MiniMap
            pannable
            zoomable
            position="bottom-right"
            className="!bg-card !border-border"
            maskColor="rgba(0,0,0,0.6)"
            nodeColor={(n) => {
              if (n.type === "imageInput") return "#06b6d4";
              if (n.type === "prompt") return "#f59e0b";
              if (n.type === "generateImage") return "#8b5cf6";
              return "#6b7280";
            }}
          />
        </ReactFlow>

        {/* Floating bottom toolbar */}
        <div
          className="absolute bottom-6 left-1/2 z-30 select-none"
          style={{ transform: `translate(calc(-50% + ${toolbarOffset.x}px), ${toolbarOffset.y}px)` }}
          data-testid="floating-toolbar"
        >
          <div className="flex items-stretch rounded-2xl border border-white/10 bg-[#0f111c]/85 backdrop-blur-xl shadow-2xl shadow-black/60 overflow-hidden">
            {/* Drag handle */}
            <button
              onPointerDown={onDragStart}
              onPointerMove={onDragMove}
              onPointerUp={onDragEnd}
              onPointerCancel={onDragEnd}
              onDoubleClick={resetToolbarPos}
              className="flex items-center justify-center px-2 cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-foreground hover:bg-white/5 transition-colors"
              title="اسحب للتحريك · انقر مزدوج لإعادة الموضع"
              data-testid="toolbar-drag-handle"
            >
              <GripHorizontal className="w-4 h-4" />
            </button>

            <div
              className="grid transition-[grid-template-columns,opacity] duration-200 ease-out"
              style={{ gridTemplateColumns: collapsed ? "0fr" : "1fr" }}
            >
              <div className="overflow-hidden">
                <div className={`flex items-center gap-1 px-2 py-1.5 ${collapsed ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
                  <ToolbarButton onClick={addImageNode} icon={<ImagePlus className="w-3.5 h-3.5 text-cyan-400" />} label="صورة" testId="button-add-image-node" />
                  <ToolbarButton onClick={addPromptNode} icon={<FileText className="w-3.5 h-3.5 text-amber-400" />} label="تعليمات" testId="button-add-prompt-node" />
                  <ToolbarButton onClick={addGenerateNode} icon={<Sparkles className="w-3.5 h-3.5 text-violet-400" />} label="توليد" testId="button-add-generate-node" />
                  <div className="w-px h-5 bg-white/10 mx-0.5" />
                  <ToolbarButton onClick={resetCanvas} icon={<RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />} label="إعادة" testId="button-reset-canvas" />
                </div>
              </div>
            </div>

            {/* Collapse / expand */}
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="flex items-center justify-center px-3 border-l border-white/10 text-foreground/70 hover:text-foreground hover:bg-white/5 transition-colors"
              title={collapsed ? "توسيع القائمة" : "تصغير القائمة"}
              data-testid="toolbar-toggle"
            >
              {collapsed ? <Plus className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolbarButton({
  onClick,
  icon,
  label,
  testId,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  testId?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-white/5 text-[11px] text-foreground/85 hover:text-foreground transition-colors whitespace-nowrap"
      data-testid={testId}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

export default function NodesEditor() {
  return (
    <ReactFlowProvider>
      <NodesEditorInner />
    </ReactFlowProvider>
  );
}
