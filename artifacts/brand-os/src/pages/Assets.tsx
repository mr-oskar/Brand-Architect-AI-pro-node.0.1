import { useState } from "react";
import {
  Library, Search, Upload, Filter, Grid3X3, List, Image, FileText,
  Film, Download, Copy, Trash2, Tag, FolderOpen, Star, Clock, Sparkles,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

const categories = ["All", "Logos", "Images", "Videos", "Documents", "Fonts"];

const assetTypes = [
  { icon: Image, label: "Images", count: 142, color: "text-cyan-500", bg: "bg-cyan-50 dark:bg-cyan-950" },
  { icon: Film, label: "Videos", count: 38, color: "text-violet-500", bg: "bg-violet-50 dark:bg-violet-950" },
  { icon: FileText, label: "Documents", count: 67, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-950" },
  { icon: Star, label: "Favorites", count: 24, color: "text-rose-500", bg: "bg-rose-50 dark:bg-rose-950" },
];

const mockAssets = [
  { id: 1, name: "Primary Logo", type: "Logo", brand: "Acme Corp", tags: ["logo", "primary"], size: "245 KB", updated: "Today", starred: true, color: "#4F46E5" },
  { id: 2, name: "Hero Banner — Summer", type: "Image", brand: "Acme Corp", tags: ["banner", "summer"], size: "1.2 MB", updated: "Yesterday", starred: false, color: "#06B6D4" },
  { id: 3, name: "Product Demo Video", type: "Video", brand: "Brand X", tags: ["product", "demo"], size: "8.4 MB", updated: "3 days ago", starred: true, color: "#8B5CF6" },
  { id: 4, name: "Brand Guidelines PDF", type: "Document", brand: "Acme Corp", tags: ["guidelines", "brand"], size: "3.1 MB", updated: "1 week ago", starred: false, color: "#F59E0B" },
  { id: 5, name: "Instagram Story Pack", type: "Image", brand: "Brand X", tags: ["social", "story"], size: "890 KB", updated: "2 days ago", starred: false, color: "#10B981" },
  { id: 6, name: "Campaign Visual — Q4", type: "Image", brand: "Acme Corp", tags: ["campaign", "q4"], size: "2.3 MB", updated: "Today", starred: true, color: "#EC4899" },
];

export default function Assets() {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  const filtered = mockAssets.filter((a) => {
    const matchesSearch = a.name.toLowerCase().includes(search.toLowerCase());
    const matchesCat = activeCategory === "All" || a.type.toLowerCase().includes(activeCategory.toLowerCase().replace(/s$/, ""));
    return matchesSearch && matchesCat;
  });

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Asset Library</h1>
          <p className="text-sm text-muted-foreground mt-1">Intelligent digital asset management with AI tagging and semantic search.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
            <Filter className="w-4 h-4" />
            Filter
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
            <Upload className="w-4 h-4" />
            Upload Assets
          </button>
        </div>
      </div>

      {/* Asset type summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {assetTypes.map((at) => {
          const Icon = at.icon;
          return (
            <div key={at.label} className="rounded-xl border border-card-border bg-card p-4 flex items-center gap-3 cursor-pointer hover:bg-muted/30 transition-colors">
              <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0", at.bg)}>
                <Icon className={cn("w-4 h-4", at.color)} />
              </div>
              <div>
                <p className="text-base font-bold text-foreground">{at.count}</p>
                <p className="text-xs text-muted-foreground">{at.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Search + filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Semantic search: find assets by meaning, content, or style..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-primary font-medium bg-primary/10 px-1.5 py-0.5 rounded">AI</span>
          )}
        </div>
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
          <button
            onClick={() => setView("grid")}
            className={cn("p-1.5 rounded-md transition-colors", view === "grid" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}
          >
            <Grid3X3 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setView("list")}
            className={cn("p-1.5 rounded-md transition-colors", view === "list" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors",
              activeCategory === cat
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Assets Grid / List */}
      {view === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {/* AI Generate new asset card */}
          <button className="rounded-xl border-2 border-dashed border-border bg-muted/20 p-6 flex flex-col items-center gap-3 hover:border-primary/50 hover:bg-primary/5 transition-colors group">
            <div className="w-10 h-10 rounded-xl bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center transition-colors">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Generate with AI</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Create new brand assets</p>
            </div>
          </button>

          {filtered.map((asset) => (
            <div key={asset.id} className="rounded-xl border border-card-border bg-card overflow-hidden group hover:shadow-md transition-shadow">
              {/* Preview */}
              <div
                className="h-36 flex items-center justify-center relative"
                style={{ backgroundColor: asset.color + "20" }}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-lg font-bold"
                  style={{ backgroundColor: asset.color }}
                >
                  {asset.name.charAt(0)}
                </div>
                {asset.starred && (
                  <Star className="absolute top-3 right-3 w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                  <button className="p-1.5 rounded-md bg-white/90 text-foreground hover:bg-white transition-colors">
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button className="p-1.5 rounded-md bg-white/90 text-foreground hover:bg-white transition-colors">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button className="p-1.5 rounded-md bg-white/90 text-destructive hover:bg-white transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {/* Info */}
              <div className="p-3">
                <p className="text-sm font-medium text-foreground truncate">{asset.name}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{asset.brand}</p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {asset.tags.slice(0, 2).map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                      <Tag className="w-2.5 h-2.5" /> {tag}
                    </span>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-2 text-[11px] text-muted-foreground">
                  <span>{asset.size}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {asset.updated}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-card-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left text-xs font-semibold text-muted-foreground px-5 py-3">Name</th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-5 py-3 hidden sm:table-cell">Type</th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-5 py-3 hidden md:table-cell">Brand</th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-5 py-3 hidden lg:table-cell">Size</th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-5 py-3">Updated</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((asset) => (
                <tr key={asset.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ backgroundColor: asset.color }}
                      >
                        {asset.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{asset.name}</p>
                        <div className="flex gap-1 mt-0.5">
                          {asset.tags.map((t) => (
                            <span key={t} className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{t}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground hidden sm:table-cell">{asset.type}</td>
                  <td className="px-5 py-3.5 text-muted-foreground hidden md:table-cell">{asset.brand}</td>
                  <td className="px-5 py-3.5 text-muted-foreground hidden lg:table-cell">{asset.size}</td>
                  <td className="px-5 py-3.5 text-muted-foreground text-xs">{asset.updated}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2 justify-end">
                      <button className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"><Download className="w-3.5 h-3.5" /></button>
                      <button className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"><Copy className="w-3.5 h-3.5" /></button>
                      <button className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-12 text-center">
          <FolderOpen className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No assets found</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Try a different search or upload new assets.</p>
        </div>
      )}
    </div>
  );
}
