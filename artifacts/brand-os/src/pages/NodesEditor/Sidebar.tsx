import { useEffect, useRef, useState } from "react";
import type { Node, Edge } from "@xyflow/react";
import {
  ImagePlus,
  FileText,
  Sparkles,
  Trash2,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
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
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { GenerateNodeSize, ImageNodeData, GenerateNodeData, PromptNodeData } from "./types";

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

  // Auto-switch to inspector when a node is selected
  useEffect(() => {
    if (props.selectedNode) setSection("inspector");
  }, [props.selectedNode?.id]);

  useEffect(() => {
    if (renamingId) {
      renameRef.current?.focus();
      renameRef.current?.select();
    }
  }, [renamingId]);

  const startNew = () => {
    setCreatingNew(true);
    setDraftName("Untitled project");
    setTimeout(() => renameRef.current?.focus(), 10);
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
      <div className="h-full w-12 flex flex-col items-center gap-1.5 py-3 border-r border-border bg-card/50 backdrop-blur z-20">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={props.onToggleCollapsed}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              data-testid="button-sidebar-expand"
            >
              <PanelLeft className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Expand sidebar</TooltipContent>
        </Tooltip>
        <div className="w-7 h-px bg-border my-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => {
                props.onToggleCollapsed();
                setSection("workspaces");
              }}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              data-testid="button-sidebar-workspaces"
            >
              <FolderKanban className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Workspaces</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => {
                props.onToggleCollapsed();
                setSection("palette");
              }}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              data-testid="button-sidebar-palette"
            >
              <Layers className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Add nodes</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => {
                props.onToggleCollapsed();
                setSection("inspector");
              }}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              data-testid="button-sidebar-inspector"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Inspector</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="h-full w-72 flex flex-col border-r border-border bg-card/50 backdrop-blur z-20">
      {/* Section tabs */}
      <div className="flex items-center gap-0.5 p-1.5 border-b border-border">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setSection("workspaces")}
              className={`flex-1 h-8 rounded-md flex items-center justify-center gap-1.5 text-[11px] font-medium transition-colors ${
                section === "workspaces"
                  ? "bg-violet-500/15 text-violet-200"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
              data-testid="tab-workspaces"
            >
              <FolderKanban className="w-3.5 h-3.5" />
              <span>Projects</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>Projects</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setSection("palette")}
              className={`flex-1 h-8 rounded-md flex items-center justify-center gap-1.5 text-[11px] font-medium transition-colors ${
                section === "palette"
                  ? "bg-violet-500/15 text-violet-200"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
              data-testid="tab-palette"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>Add nodes</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setSection("inspector")}
              className={`flex-1 h-8 rounded-md flex items-center justify-center gap-1.5 text-[11px] font-medium transition-colors ${
                section === "inspector"
                  ? "bg-violet-500/15 text-violet-200"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
              data-testid="tab-inspector"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>Inspector</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>Selected node</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={props.onToggleCollapsed}
              className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors flex-shrink-0"
              data-testid="button-sidebar-collapse"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Collapse</TooltipContent>
        </Tooltip>
      </div>

      {/* Section content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {section === "workspaces" && (
          <div className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
                Projects
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={startNew}
                    className="w-6 h-6 rounded-md flex items-center justify-center text-violet-200 hover:text-white bg-violet-500/15 hover:bg-violet-500/30 border border-violet-500/30 transition-colors"
                    data-testid="button-create-workspace"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>New project</TooltipContent>
              </Tooltip>
            </div>

            <div className="space-y-1">
              {creatingNew && (
                <div className="flex items-center gap-1 p-1.5 rounded-lg border border-violet-500/40 bg-violet-500/5">
                  <Folder className="w-3.5 h-3.5 text-violet-300 flex-shrink-0" />
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
                    className="w-5 h-5 rounded text-emerald-300 hover:bg-white/5"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => {
                      setCreatingNew(false);
                      setDraftName("");
                    }}
                    className="w-5 h-5 rounded text-muted-foreground hover:bg-white/5"
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
                    className={`group flex items-center gap-1 p-1.5 rounded-lg border transition-colors ${
                      isCurrent
                        ? "border-violet-500/40 bg-violet-500/10"
                        : "border-transparent hover:bg-white/5 hover:border-white/5"
                    }`}
                    data-testid={`workspace-${ws.id}`}
                  >
                    <Folder className={`w-3.5 h-3.5 flex-shrink-0 ${isCurrent ? "text-violet-300" : "text-muted-foreground"}`} />
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
                        className={`flex-1 text-left text-[11.5px] truncate ${isCurrent ? "text-foreground font-medium" : "text-foreground/85"}`}
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
                              <Pencil className="w-2.5 h-2.5" />
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
                              <Copy className="w-2.5 h-2.5" />
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
                              <Trash2 className="w-2.5 h-2.5" />
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
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mb-1.5">
                Add node
              </div>
              <div className="space-y-1.5">
                <PaletteButton
                  onClick={props.onAddImage}
                  icon={<ImagePlus className="w-4 h-4 text-cyan-300" />}
                  title="Image reference"
                  description="Upload an image to use as a reference"
                  testId="button-add-image-node"
                />
                <PaletteButton
                  onClick={props.onAddPrompt}
                  icon={<FileText className="w-4 h-4 text-amber-300" />}
                  title="Instructions"
                  description="A reusable prompt block"
                  testId="button-add-prompt-node"
                />
                <PaletteButton
                  onClick={props.onAddGenerate}
                  icon={<Sparkles className="w-4 h-4 text-violet-300" />}
                  title="Generate image"
                  description="Run AI to create an image"
                  testId="button-add-generate-node"
                />
              </div>
            </div>

            <div className="border-t border-border pt-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mb-1.5">
                Workflow
              </div>
              <button
                onClick={() => {
                  if (confirm("Reset this workspace? All nodes will be replaced with the starter graph.")) {
                    props.onResetCanvas();
                  }
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] text-foreground/85 hover:text-foreground hover:bg-white/5 transition-colors border border-border"
                data-testid="button-reset-canvas"
              >
                <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Reset workspace</span>
              </button>
            </div>

            <div className="border-t border-border pt-3 text-[10px] text-muted-foreground/60 space-y-1 leading-relaxed">
              <div className="font-semibold text-muted-foreground/80 mb-1">Tips</div>
              <p>• Drag from a handle to connect nodes.</p>
              <p>• Double-click an edge to delete it.</p>
              <p>• Drag an edge endpoint off to disconnect.</p>
              <p>• Press <kbd className="px-1 py-0.5 bg-white/5 border border-white/10 rounded text-[9px]">Delete</kbd> to remove a selected node.</p>
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

function PaletteButton({
  onClick,
  icon,
  title,
  description,
  testId,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  testId?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 p-2 rounded-lg border border-border hover:border-violet-500/40 hover:bg-violet-500/5 text-left transition-colors group"
      data-testid={testId}
    >
      <div className="w-7 h-7 rounded-md bg-muted/50 group-hover:bg-violet-500/15 flex items-center justify-center transition-colors flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11.5px] font-medium text-foreground truncate">{title}</div>
        <div className="text-[10px] text-muted-foreground/80 truncate">{description}</div>
      </div>
      <Plus className="w-3.5 h-3.5 text-muted-foreground/60 group-hover:text-violet-300 flex-shrink-0" />
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
      <div className="p-6 text-center text-muted-foreground/70">
        <Settings2 className="w-6 h-6 mx-auto mb-2 opacity-50" />
        <div className="text-[12px] text-foreground/80 font-medium mb-1">No node selected</div>
        <div className="text-[10.5px]">Click a node on the canvas to edit its settings.</div>
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
          <div className="text-[11.5px] font-semibold text-foreground truncate">
            {nodeTitle(node)}
          </div>
          <div className="text-[9.5px] font-mono text-muted-foreground/70 truncate">{node.id}</div>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => onDuplicate(node.id)}
              className="w-6 h-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 flex items-center justify-center"
              data-testid={`inspector-duplicate-${node.id}`}
            >
              <Copy className="w-3 h-3" />
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
              <Trash2 className="w-3 h-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Delete</TooltipContent>
        </Tooltip>
      </div>

      {/* Node-specific settings */}
      {node.type === "imageInput" && <ImageNodeInspector node={node} onUpdate={onUpdate} />}
      {node.type === "prompt" && <PromptNodeInspector node={node} onUpdate={onUpdate} />}
      {node.type === "generateImage" && <GenerateNodeInspector node={node} onUpdate={onUpdate} />}

      {/* Position */}
      <div className="border-t border-border pt-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mb-1.5">
          Position
        </div>
        <div className="grid grid-cols-2 gap-1.5">
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
      <div className="border-t border-border pt-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mb-1.5">
          Connections ({connectedEdges.length})
        </div>
        {connectedEdges.length === 0 ? (
          <div className="text-[10.5px] text-muted-foreground/60">
            No connections. Drag from a handle to create one.
          </div>
        ) : (
          <div className="space-y-1">
            {connectedEdges.map((e) => {
              const direction = e.source === node.id ? "out" : "in";
              const otherId = e.source === node.id ? e.target : e.source;
              return (
                <div
                  key={e.id}
                  className="flex items-center gap-1.5 px-1.5 py-1 rounded-md bg-muted/30 text-[10.5px]"
                  data-testid={`inspector-edge-${e.id}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${direction === "out" ? "bg-emerald-400" : "bg-cyan-400"}`} />
                  <span className="text-muted-foreground/70 font-mono">
                    {direction === "out" ? "→" : "←"}
                  </span>
                  <span className="flex-1 truncate font-mono text-foreground/85">{otherId}</span>
                  {e.targetHandle && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-white/5 text-muted-foreground/70 font-mono">
                      {e.targetHandle}
                    </span>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => onDeleteEdge(e.id)}
                        className="w-4 h-4 rounded text-muted-foreground hover:text-red-300 hover:bg-red-500/15 flex items-center justify-center"
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
  if (type === "imageInput") {
    return (
      <div className="w-7 h-7 rounded-md bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center flex-shrink-0">
        <ImagePlus className="w-3.5 h-3.5 text-cyan-300" />
      </div>
    );
  }
  if (type === "prompt") {
    return (
      <div className="w-7 h-7 rounded-md bg-amber-500/15 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
        <FileText className="w-3.5 h-3.5 text-amber-300" />
      </div>
    );
  }
  if (type === "generateImage") {
    return (
      <div className="w-7 h-7 rounded-md bg-violet-500/15 border border-violet-500/30 flex items-center justify-center flex-shrink-0">
        <Sparkles className="w-3.5 h-3.5 text-violet-300" />
      </div>
    );
  }
  return (
    <div className="w-7 h-7 rounded-md bg-muted/50 flex items-center justify-center flex-shrink-0">
      <Layers className="w-3.5 h-3.5" />
    </div>
  );
}

function nodeTitle(node: Node): string {
  if (node.type === "imageInput") return ((node.data as ImageNodeData).label as string) || "Image reference";
  if (node.type === "prompt") return "Instructions";
  if (node.type === "generateImage") return ((node.data as GenerateNodeData).label as string) || "Generate image";
  return node.type ?? "Node";
}

function ImageNodeInspector({ node, onUpdate }: { node: Node; onUpdate: (id: string, patch: Record<string, unknown>) => void }) {
  const d = node.data as ImageNodeData;
  return (
    <div className="space-y-2">
      <Field label="Label">
        <input
          value={d.label ?? ""}
          onChange={(e) => onUpdate(node.id, { label: e.target.value })}
          className="w-full text-[11px] bg-muted/30 border border-border rounded-md px-2 py-1 text-foreground focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          data-testid="inspector-image-label"
        />
      </Field>
      {d.uploading && (
        <div className="flex items-center gap-2 text-[10.5px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-md px-2 py-1.5">
          <Loader2 className="w-3 h-3 animate-spin" />
          Uploading file…
        </div>
      )}
      {d.imageDataUrl && !d.uploading && (
        <Field label="Preview">
          <img src={d.imageDataUrl} alt="" className="w-full h-24 object-cover rounded-md border border-border" />
          <div className="text-[10px] text-muted-foreground/70 truncate mt-1">{d.filename || "—"}</div>
        </Field>
      )}
    </div>
  );
}

function PromptNodeInspector({ node, onUpdate }: { node: Node; onUpdate: (id: string, patch: Record<string, unknown>) => void }) {
  const d = node.data as PromptNodeData;
  return (
    <div className="space-y-2">
      <Field label="Text">
        <textarea
          value={d.text ?? ""}
          onChange={(e) => onUpdate(node.id, { text: e.target.value })}
          rows={5}
          className="w-full text-[11px] bg-muted/30 border border-border rounded-md px-2 py-1.5 text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/40 resize-none"
          data-testid="inspector-prompt-text"
        />
      </Field>
    </div>
  );
}

const SIZE_OPTIONS: { value: GenerateNodeSize; label: string }[] = [
  { value: "1024x1024", label: "Square (1024×1024)" },
  { value: "1024x1536", label: "Portrait (1024×1536)" },
  { value: "1536x1024", label: "Landscape (1536×1024)" },
  { value: "auto", label: "Auto" },
];

function GenerateNodeInspector({ node, onUpdate }: { node: Node; onUpdate: (id: string, patch: Record<string, unknown>) => void }) {
  const d = node.data as GenerateNodeData;
  return (
    <div className="space-y-2">
      <Field label="Label">
        <input
          value={d.label ?? "Generate"}
          onChange={(e) => onUpdate(node.id, { label: e.target.value })}
          className="w-full text-[11px] bg-muted/30 border border-border rounded-md px-2 py-1 text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/40"
          data-testid="inspector-generate-label"
        />
      </Field>
      <Field label="Output size">
        <select
          value={d.size ?? "1024x1024"}
          onChange={(e) => onUpdate(node.id, { size: e.target.value as GenerateNodeSize })}
          className="w-full text-[11px] bg-muted/30 border border-border rounded-md px-2 py-1 text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/40"
          data-testid="inspector-generate-size"
        >
          {SIZE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Prompt">
        <textarea
          value={d.prompt ?? ""}
          onChange={(e) => onUpdate(node.id, { prompt: e.target.value })}
          rows={5}
          className="w-full text-[11px] bg-muted/30 border border-border rounded-md px-2 py-1.5 text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-none"
          data-testid="inspector-generate-prompt"
        />
      </Field>
      <div className="text-[10px] text-muted-foreground/70 leading-relaxed">
        Status: <span className="font-mono text-foreground/80">{d.status}</span>
        {d.error && <div className="text-red-300 mt-0.5">{d.error}</div>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[9.5px] uppercase tracking-wider text-muted-foreground/70 font-semibold mb-1">
        {label}
      </div>
      {children}
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
    <label className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/30 border border-border focus-within:border-violet-500/40">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-mono">{label}</span>
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
