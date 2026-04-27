import { useEffect, useRef, useState } from "react";
import type { Node, Edge } from "@xyflow/react";
import {
  Image as ImageIcon,
  FileText,
  Sparkles,
  Trash2,
  RotateCcw,
  ChevronLeft,
  Plus,
  Pencil,
  Check,
  X,
  Copy,
  Layers,
  FolderKanban,
  PanelLeft,
  Settings2,
  Folder,
  Loader2,
  Square,
  RectangleVertical,
  RectangleHorizontal,
  Wand2,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type {
  GenerateNodeBackground,
  GenerateNodeData,
  GenerateNodeQuality,
  GenerateNodeSize,
  ImageNodeData,
  PromptNodeData,
} from "./types";

type SidebarSection = "workspaces" | "palette" | "inspector";

export type SidebarProps = {
  collapsed: boolean;
  onToggleCollapsed: () => void;

  workspaces: { id: string; name: string }[];
  currentWorkspaceId: string;
  onSwitchWorkspace: (id: string) => void;
  onCreateWorkspace: (name: string) => void;
  onRenameWorkspace: (id: string, name: string) => void;
  onDeleteWorkspace: (id: string) => void;
  onDuplicateWorkspace: (id: string) => void;

  onAddImage: () => void;
  onAddPrompt: () => void;
  onAddGenerate: () => void;
  onResetCanvas: () => void;

  selectedNode: Node | null;
  onUpdateNodeData: (id: string, patch: Record<string, unknown>) => void;
  onDeleteNode: (id: string) => void;
  onDuplicateNode: (id: string) => void;

  edges: Edge[];
  onDeleteEdge: (id: string) => void;
};

export default function Sidebar(props: SidebarProps) {
  const [section, setSection] = useState<SidebarSection>("palette");
  const [creatingNew, setCreatingNew] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (props.selectedNode) setSection("inspector");
  }, [props.selectedNode?.id]);

  useEffect(() => {
    if (renamingId || creatingNew) {
      renameRef.current?.focus();
      renameRef.current?.select();
    }
  }, [renamingId, creatingNew]);

  const startNew = () => {
    setCreatingNew(true);
    setDraftName("Untitled project");
  };
  const commitNew = () => {
    const n = draftName.trim() || "Untitled project";
    props.onCreateWorkspace(n);
    setCreatingNew(false);
    setDraftName("");
  };
  const startRename = (id: string, name: string) => {
    setRenamingId(id);
    setDraftName(name);
  };
  const commitRename = () => {
    if (renamingId) {
      const n = draftName.trim() || "Untitled project";
      props.onRenameWorkspace(renamingId, n);
    }
    setRenamingId(null);
    setDraftName("");
  };

  if (props.collapsed) {
    return (
      <div className="h-full w-12 flex flex-col items-center gap-1 py-3 border-r border-white/[0.06] bg-[#0d0f15]/85 backdrop-blur-xl z-20">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={props.onToggleCollapsed}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground/80 hover:text-foreground hover:bg-white/5 transition-colors"
              data-testid="button-sidebar-expand"
            >
              <PanelLeft className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Expand</TooltipContent>
        </Tooltip>
        <div className="w-7 h-px bg-white/[0.06] my-1" />
        {(
          [
            { key: "workspaces", Icon: FolderKanban, label: "Projects" },
            { key: "palette", Icon: Layers, label: "Add" },
            { key: "inspector", Icon: Settings2, label: "Inspector" },
          ] as const
        ).map(({ key, Icon, label }) => (
          <Tooltip key={key}>
            <TooltipTrigger asChild>
              <button
                onClick={() => {
                  props.onToggleCollapsed();
                  setSection(key);
                }}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground/80 hover:text-foreground hover:bg-white/5 transition-colors"
                data-testid={`button-sidebar-${key}`}
              >
                <Icon className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{label}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    );
  }

  return (
    <div className="h-full w-72 flex flex-col border-r border-white/[0.06] bg-[#0d0f15]/85 backdrop-blur-xl z-20">
      {/* Tab strip */}
      <div className="flex items-center gap-0.5 p-2 border-b border-white/[0.05]">
        <div className="flex-1 flex items-center gap-0.5 rounded-lg bg-white/[0.025] p-0.5">
          {(
            [
              { key: "workspaces", Icon: FolderKanban, label: "Projects" },
              { key: "palette", Icon: Layers, label: "Add" },
              { key: "inspector", Icon: Settings2, label: "Inspect" },
            ] as const
          ).map(({ key, Icon, label }) => (
            <button
              key={key}
              onClick={() => setSection(key)}
              className={`flex-1 h-7 rounded-md flex items-center justify-center gap-1.5 text-[10.5px] font-medium tracking-tight transition-all ${
                section === key
                  ? "bg-white/[0.06] text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"
                  : "text-muted-foreground/75 hover:text-foreground"
              }`}
              data-testid={`tab-${key}`}
            >
              <Icon className="w-3 h-3" strokeWidth={1.5} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={props.onToggleCollapsed}
              className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground/70 hover:text-foreground hover:bg-white/5 transition-colors"
              data-testid="button-sidebar-collapse"
            >
              <ChevronLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Collapse</TooltipContent>
        </Tooltip>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {section === "workspaces" && (
          <div className="p-3 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <SectionTitle>Projects</SectionTitle>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={startNew}
                    className="w-6 h-6 rounded-md flex items-center justify-center text-foreground/85 bg-white/[0.04] hover:bg-white/10 border border-white/[0.06] hover:border-white/15 transition-colors"
                    data-testid="button-create-workspace"
                  >
                    <Plus className="w-3 h-3" strokeWidth={1.75} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>New project</TooltipContent>
              </Tooltip>
            </div>

            <div className="space-y-1">
              {creatingNew && (
                <div className="flex items-center gap-1.5 p-2 rounded-lg border border-[#7c5cff]/30 bg-[#7c5cff]/[0.08]">
                  <Folder className="w-3.5 h-3.5 text-[#a78bfa] flex-shrink-0" strokeWidth={1.5} />
                  <input
                    ref={renameRef}
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitNew();
                      if (e.key === "Escape") {
                        setCreatingNew(false);
                        setDraftName("");
                      }
                    }}
                    className="flex-1 bg-transparent text-[11.5px] text-foreground focus:outline-none"
                    data-testid="input-new-workspace-name"
                  />
                  <button
                    onClick={commitNew}
                    className="w-5 h-5 rounded text-emerald-300 hover:bg-white/5 flex items-center justify-center"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => {
                      setCreatingNew(false);
                      setDraftName("");
                    }}
                    className="w-5 h-5 rounded text-muted-foreground hover:bg-white/5 flex items-center justify-center"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              {props.workspaces.map((ws) => {
                const isCurrent = ws.id === props.currentWorkspaceId;
                const isRenaming = renamingId === ws.id;
                return (
                  <div
                    key={ws.id}
                    className={`group flex items-center gap-1.5 p-2 rounded-lg border transition-colors ${
                      isCurrent
                        ? "border-white/15 bg-white/[0.05]"
                        : "border-transparent hover:bg-white/[0.03] hover:border-white/[0.06]"
                    }`}
                    data-testid={`workspace-${ws.id}`}
                  >
                    <Folder
                      className={`w-3.5 h-3.5 flex-shrink-0 ${isCurrent ? "text-[#a78bfa]" : "text-muted-foreground/70"}`}
                      strokeWidth={1.5}
                    />
                    {isRenaming ? (
                      <input
                        ref={renameRef}
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename();
                          if (e.key === "Escape") {
                            setRenamingId(null);
                            setDraftName("");
                          }
                        }}
                        className="flex-1 bg-transparent text-[11.5px] text-foreground focus:outline-none"
                        data-testid={`input-rename-${ws.id}`}
                      />
                    ) : (
                      <button
                        onClick={() => props.onSwitchWorkspace(ws.id)}
                        className={`flex-1 text-left text-[11.5px] truncate tracking-tight ${
                          isCurrent ? "text-foreground font-medium" : "text-foreground/85"
                        }`}
                        data-testid={`button-switch-workspace-${ws.id}`}
                      >
                        {ws.name}
                      </button>
                    )}

                    {!isRenaming && (
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => startRename(ws.id, ws.name)}
                              className="w-5 h-5 rounded text-muted-foreground hover:text-foreground hover:bg-white/10 flex items-center justify-center"
                              data-testid={`button-rename-workspace-${ws.id}`}
                            >
                              <Pencil className="w-2.5 h-2.5" strokeWidth={1.5} />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Rename</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => props.onDuplicateWorkspace(ws.id)}
                              className="w-5 h-5 rounded text-muted-foreground hover:text-foreground hover:bg-white/10 flex items-center justify-center"
                              data-testid={`button-duplicate-workspace-${ws.id}`}
                            >
                              <Copy className="w-2.5 h-2.5" strokeWidth={1.5} />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Duplicate</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => {
                                if (confirm(`Delete project "${ws.name}"?`)) props.onDeleteWorkspace(ws.id);
                              }}
                              className="w-5 h-5 rounded text-muted-foreground hover:text-red-300 hover:bg-red-500/15 flex items-center justify-center"
                              data-testid={`button-delete-workspace-${ws.id}`}
                            >
                              <Trash2 className="w-2.5 h-2.5" strokeWidth={1.5} />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Delete</TooltipContent>
                        </Tooltip>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {section === "palette" && (
          <div className="p-3 space-y-3">
            <div>
              <SectionTitle>Add node</SectionTitle>
              <div className="space-y-1.5 mt-1.5">
                <PaletteButton
                  onClick={props.onAddImage}
                  dot="bg-sky-400 shadow-[0_0_8px_2px_rgba(56,189,248,0.45)]"
                  icon={<ImageIcon className="w-3.5 h-3.5 text-foreground/85" strokeWidth={1.5} />}
                  title="Image reference"
                  description="Upload to use as a reference"
                  testId="button-add-image-node"
                />
                <PaletteButton
                  onClick={props.onAddPrompt}
                  dot="bg-amber-300 shadow-[0_0_8px_2px_rgba(252,211,77,0.45)]"
                  icon={<FileText className="w-3.5 h-3.5 text-foreground/85" strokeWidth={1.5} />}
                  title="Instructions"
                  description="A reusable prompt block"
                  testId="button-add-prompt-node"
                />
                <PaletteButton
                  onClick={props.onAddGenerate}
                  dot="bg-[#a78bfa] shadow-[0_0_8px_2px_rgba(167,139,250,0.45)]"
                  icon={<Sparkles className="w-3.5 h-3.5 text-foreground/85" strokeWidth={1.5} />}
                  title="Generate image"
                  description="Run AI to create an image"
                  testId="button-add-generate-node"
                />
              </div>
            </div>

            <div className="border-t border-white/[0.05] pt-3">
              <SectionTitle>Workflow</SectionTitle>
              <button
                onClick={() => {
                  if (confirm("Reset this workspace? Nodes will be replaced with the starter graph.")) {
                    props.onResetCanvas();
                  }
                }}
                className="mt-1.5 w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] text-foreground/85 hover:text-foreground hover:bg-white/5 transition-colors border border-white/[0.06] hover:border-white/15"
                data-testid="button-reset-canvas"
              >
                <RotateCcw className="w-3.5 h-3.5 text-muted-foreground/80" strokeWidth={1.5} />
                <span>Reset workspace</span>
              </button>
            </div>

            <div className="border-t border-white/[0.05] pt-3 text-[10px] text-muted-foreground/55 space-y-1 leading-relaxed">
              <div className="font-semibold text-muted-foreground/80 mb-1 uppercase tracking-wider text-[9.5px]">
                Tips
              </div>
              <p>· Drag from a handle to connect nodes.</p>
              <p>· Double-click an edge to delete it.</p>
              <p>· Drag an edge endpoint off to disconnect.</p>
              <p>
                · Press{" "}
                <kbd className="px-1 py-0.5 bg-white/[0.06] border border-white/10 rounded text-[9px] font-mono">
                  Del
                </kbd>{" "}
                to remove a selected node.
              </p>
            </div>
          </div>
        )}

        {section === "inspector" && (
          <InspectorPanel
            node={props.selectedNode}
            onUpdate={props.onUpdateNodeData}
            onDelete={props.onDeleteNode}
            onDuplicate={props.onDuplicateNode}
            edges={props.edges}
            onDeleteEdge={props.onDeleteEdge}
          />
        )}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground/55 font-semibold">
      {children}
    </div>
  );
}

function PaletteButton({
  onClick,
  icon,
  dot,
  title,
  description,
  testId,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  dot: string;
  title: string;
  description: string;
  testId?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 p-2 rounded-lg border border-white/[0.06] bg-white/[0.015] hover:border-white/15 hover:bg-white/[0.04] text-left transition-all group"
      data-testid={testId}
    >
      <div className="relative w-8 h-8 rounded-lg bg-white/[0.03] border border-white/[0.05] flex items-center justify-center flex-shrink-0">
        <span className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ${dot}`} />
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11.5px] font-medium text-foreground/95 truncate tracking-tight">{title}</div>
        <div className="text-[10px] text-muted-foreground/65 truncate">{description}</div>
      </div>
      <Plus className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-foreground/85 transition-colors flex-shrink-0" strokeWidth={1.5} />
    </button>
  );
}

function InspectorPanel({
  node,
  onUpdate,
  onDelete,
  onDuplicate,
  edges,
  onDeleteEdge,
}: {
  node: Node | null;
  onUpdate: (id: string, patch: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  edges: Edge[];
  onDeleteEdge: (id: string) => void;
}) {
  if (!node) {
    return (
      <div className="p-8 text-center text-muted-foreground/65">
        <div className="w-9 h-9 mx-auto mb-3 rounded-full border border-white/[0.06] bg-white/[0.025] flex items-center justify-center">
          <Settings2 className="w-4 h-4 opacity-55" strokeWidth={1.5} />
        </div>
        <div className="text-[12px] text-foreground/85 font-medium mb-1 tracking-tight">No selection</div>
        <div className="text-[10.5px] leading-relaxed">Click a node on the canvas to edit it.</div>
      </div>
    );
  }

  const connectedEdges = edges.filter((e) => e.source === node.id || e.target === node.id);

  return (
    <div className="p-3 space-y-3">
      {/* Header */}
      <div className="flex items-start gap-2">
        <NodeKindBadge type={node.type} />
        <div className="flex-1 min-w-0">
          <div className="text-[11.5px] font-medium text-foreground/95 truncate tracking-tight">
            {nodeTitle(node)}
          </div>
          <div className="text-[9.5px] font-mono text-muted-foreground/55 truncate">{node.id}</div>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => onDuplicate(node.id)}
              className="w-6 h-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 flex items-center justify-center"
              data-testid={`inspector-duplicate-${node.id}`}
            >
              <Copy className="w-3 h-3" strokeWidth={1.5} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Duplicate</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => {
                if (confirm("Delete this node?")) onDelete(node.id);
              }}
              className="w-6 h-6 rounded-md text-muted-foreground hover:text-red-300 hover:bg-red-500/15 flex items-center justify-center"
              data-testid={`inspector-delete-${node.id}`}
            >
              <Trash2 className="w-3 h-3" strokeWidth={1.5} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Delete</TooltipContent>
        </Tooltip>
      </div>

      {/* Type-specific */}
      {node.type === "imageInput" && <ImageNodeInspector node={node} onUpdate={onUpdate} />}
      {node.type === "prompt" && <PromptNodeInspector node={node} onUpdate={onUpdate} />}
      {node.type === "generateImage" && <GenerateNodeInspector node={node} onUpdate={onUpdate} />}

      {/* Position */}
      <div className="border-t border-white/[0.05] pt-3">
        <SectionTitle>Position</SectionTitle>
        <div className="grid grid-cols-2 gap-1.5 mt-1.5">
          <NumberField
            label="X"
            value={Math.round(node.position.x)}
            onChange={(v) => onUpdate(node.id, { __position: { x: v, y: node.position.y } })}
            testId="inspector-pos-x"
          />
          <NumberField
            label="Y"
            value={Math.round(node.position.y)}
            onChange={(v) => onUpdate(node.id, { __position: { x: node.position.x, y: v } })}
            testId="inspector-pos-y"
          />
        </div>
      </div>

      {/* Connections */}
      <div className="border-t border-white/[0.05] pt-3">
        <SectionTitle>Connections · {connectedEdges.length}</SectionTitle>
        {connectedEdges.length === 0 ? (
          <div className="text-[10.5px] text-muted-foreground/55 mt-1.5 leading-relaxed">
            No connections. Drag from a handle to create one.
          </div>
        ) : (
          <div className="space-y-1 mt-1.5">
            {connectedEdges.map((e) => {
              const direction = e.source === node.id ? "out" : "in";
              const otherId = e.source === node.id ? e.target : e.source;
              return (
                <div
                  key={e.id}
                  className="group flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.025] border border-white/[0.04] text-[10.5px]"
                  data-testid={`inspector-edge-${e.id}`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${direction === "out" ? "bg-emerald-400" : "bg-sky-400"}`}
                  />
                  <span className="text-muted-foreground/65 font-mono">
                    {direction === "out" ? "→" : "←"}
                  </span>
                  <span className="flex-1 truncate font-mono text-foreground/85">{otherId}</span>
                  {e.targetHandle && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-white/5 text-muted-foreground/65 font-mono">
                      {e.targetHandle}
                    </span>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => onDeleteEdge(e.id)}
                        className="w-4 h-4 rounded text-muted-foreground hover:text-red-300 hover:bg-red-500/15 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        data-testid={`inspector-delete-edge-${e.id}`}
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Disconnect</TooltipContent>
                  </Tooltip>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function NodeKindBadge({ type }: { type?: string }) {
  const conf = (() => {
    if (type === "imageInput")
      return { Icon: ImageIcon, dot: "bg-sky-400 shadow-[0_0_6px_1px_rgba(56,189,248,0.45)]" };
    if (type === "prompt")
      return { Icon: FileText, dot: "bg-amber-300 shadow-[0_0_6px_1px_rgba(252,211,77,0.45)]" };
    if (type === "generateImage")
      return { Icon: Sparkles, dot: "bg-[#a78bfa] shadow-[0_0_6px_1px_rgba(167,139,250,0.45)]" };
    return { Icon: Layers, dot: "bg-white/30" };
  })();
  const { Icon, dot } = conf;
  return (
    <div className="relative w-7 h-7 rounded-lg bg-white/[0.03] border border-white/[0.05] flex items-center justify-center flex-shrink-0">
      <span className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ${dot}`} />
      <Icon className="w-3.5 h-3.5 text-foreground/85" strokeWidth={1.5} />
    </div>
  );
}

function nodeTitle(node: Node): string {
  if (node.type === "imageInput") return ((node.data as ImageNodeData).label as string) || "Image reference";
  if (node.type === "prompt") return "Instructions";
  if (node.type === "generateImage")
    return ((node.data as GenerateNodeData).label as string) || "Generate image";
  return node.type ?? "Node";
}

function ImageNodeInspector({
  node,
  onUpdate,
}: {
  node: Node;
  onUpdate: (id: string, patch: Record<string, unknown>) => void;
}) {
  const d = node.data as ImageNodeData;
  return (
    <div className="space-y-2">
      <Field label="Label">
        <input
          value={d.label ?? ""}
          onChange={(e) => onUpdate(node.id, { label: e.target.value })}
          className="w-full text-[11px] bg-white/[0.025] border border-white/[0.06] rounded-md px-2 py-1 text-foreground focus:outline-none focus:border-white/20"
          data-testid="inspector-image-label"
        />
      </Field>
      {d.uploading && (
        <div className="flex items-center gap-2 text-[10.5px] text-amber-200/90 bg-amber-400/[0.08] border border-amber-400/20 rounded-md px-2 py-1.5">
          <Loader2 className="w-3 h-3 animate-spin" />
          Uploading file…
        </div>
      )}
      {d.imageDataUrl && !d.uploading && (
        <Field label="Preview">
          <img
            src={d.imageDataUrl}
            alt=""
            className="w-full h-24 object-cover rounded-md border border-white/[0.06]"
          />
          <div className="text-[10px] text-muted-foreground/65 truncate mt-1">{d.filename || "—"}</div>
        </Field>
      )}
    </div>
  );
}

function PromptNodeInspector({
  node,
  onUpdate,
}: {
  node: Node;
  onUpdate: (id: string, patch: Record<string, unknown>) => void;
}) {
  const d = node.data as PromptNodeData;
  return (
    <Field label="Text">
      <textarea
        value={d.text ?? ""}
        onChange={(e) => onUpdate(node.id, { text: e.target.value })}
        rows={6}
        className="w-full text-[11px] bg-white/[0.025] border border-white/[0.06] rounded-md px-2 py-1.5 text-foreground focus:outline-none focus:border-white/20 resize-none"
        data-testid="inspector-prompt-text"
      />
    </Field>
  );
}

const SIZE_PRESETS: { value: GenerateNodeSize; label: string; Icon: typeof Square }[] = [
  { value: "1024x1024", label: "Square", Icon: Square },
  { value: "1024x1536", label: "Portrait", Icon: RectangleVertical },
  { value: "1536x1024", label: "Landscape", Icon: RectangleHorizontal },
  { value: "auto", label: "Auto", Icon: Wand2 },
];

const QUALITY_OPTIONS: { value: GenerateNodeQuality; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const BG_OPTIONS: { value: GenerateNodeBackground; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "opaque", label: "Solid" },
  { value: "transparent", label: "Transparent" },
];

function GenerateNodeInspector({
  node,
  onUpdate,
}: {
  node: Node;
  onUpdate: (id: string, patch: Record<string, unknown>) => void;
}) {
  const d = node.data as GenerateNodeData;
  return (
    <div className="space-y-2.5">
      <Field label="Label">
        <input
          value={d.label ?? "Generate"}
          onChange={(e) => onUpdate(node.id, { label: e.target.value })}
          className="w-full text-[11px] bg-white/[0.025] border border-white/[0.06] rounded-md px-2 py-1 text-foreground focus:outline-none focus:border-white/20"
          data-testid="inspector-generate-label"
        />
      </Field>

      <Field label="Aspect">
        <div className="grid grid-cols-4 gap-1">
          {SIZE_PRESETS.map((s) => (
            <button
              key={s.value}
              onClick={() => onUpdate(node.id, { size: s.value })}
              className={`flex flex-col items-center gap-1 py-1.5 rounded-md border text-[9.5px] transition-all ${
                d.size === s.value
                  ? "border-[#7c5cff]/55 bg-[#7c5cff]/10 text-foreground"
                  : "border-white/[0.05] bg-white/[0.02] text-muted-foreground/80 hover:border-white/15 hover:text-foreground"
              }`}
              data-testid={`inspector-size-${s.value}`}
            >
              <s.Icon className="w-3 h-3" strokeWidth={1.5} />
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      </Field>

      <Field label="Quality">
        <div className="grid grid-cols-4 gap-1">
          {QUALITY_OPTIONS.map((q) => (
            <button
              key={q.value}
              onClick={() => onUpdate(node.id, { quality: q.value })}
              className={`py-1.5 rounded-md border text-[9.5px] transition-all ${
                d.quality === q.value
                  ? "border-[#7c5cff]/55 bg-[#7c5cff]/10 text-foreground"
                  : "border-white/[0.05] bg-white/[0.02] text-muted-foreground/80 hover:border-white/15 hover:text-foreground"
              }`}
              data-testid={`inspector-quality-${q.value}`}
            >
              {q.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Background">
        <div className="grid grid-cols-3 gap-1">
          {BG_OPTIONS.map((b) => (
            <button
              key={b.value}
              onClick={() => onUpdate(node.id, { background: b.value })}
              className={`py-1.5 rounded-md border text-[9.5px] transition-all ${
                d.background === b.value
                  ? "border-[#7c5cff]/55 bg-[#7c5cff]/10 text-foreground"
                  : "border-white/[0.05] bg-white/[0.02] text-muted-foreground/80 hover:border-white/15 hover:text-foreground"
              }`}
              data-testid={`inspector-bg-${b.value}`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Prompt">
        <textarea
          value={d.prompt ?? ""}
          onChange={(e) => onUpdate(node.id, { prompt: e.target.value })}
          rows={5}
          className="w-full text-[11px] bg-white/[0.025] border border-white/[0.06] rounded-md px-2 py-1.5 text-foreground focus:outline-none focus:border-white/20 resize-none"
          data-testid="inspector-generate-prompt"
        />
      </Field>

      <div className="text-[10px] text-muted-foreground/65 leading-relaxed">
        Status: <span className="font-mono text-foreground/80">{d.status}</span>
        {d.error && <div className="text-red-300/85 mt-0.5">{d.error}</div>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <SectionTitle>{label}</SectionTitle>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  testId?: string;
}) {
  return (
    <label className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.025] border border-white/[0.06] focus-within:border-white/20">
      <span className="text-[9.5px] uppercase tracking-wider text-muted-foreground/65 font-mono">
        {label}
      </span>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="w-full bg-transparent text-[11px] text-foreground focus:outline-none"
        data-testid={testId}
      />
    </label>
  );
}
