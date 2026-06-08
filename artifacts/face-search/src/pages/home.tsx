import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Database, FolderOpen, ImageIcon, Loader2, Search, X, SlidersHorizontal, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

export interface R2Image {
  key: string;
  url: string;
  folder: string;
  filename: string;
  size: number;
  lastModified: string;
}

interface R2Stats {
  totalImages: number;
  totalFolders: number;
  folders: string[];
}

async function fetchR2Images(folder?: string): Promise<R2Image[]> {
  const url = folder
    ? `${API_BASE}/api/r2/images?folder=${encodeURIComponent(folder)}`
    : `${API_BASE}/api/r2/images`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to load images from R2");
  return res.json();
}

async function fetchR2Stats(): Promise<R2Stats> {
  const res = await fetch(`${API_BASE}/api/r2/stats`);
  if (!res.ok) throw new Error("Failed to load R2 stats");
  return res.json();
}

type SortOrder = "newest" | "oldest" | "az" | "za";

export function Home() {
  const [search, setSearch] = useState("");
  const [selectedFolder, setSelectedFolder] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [imgErrors, setImgErrors] = useState<Set<string>>(new Set());

  const { data: stats, isLoading: isLoadingStats } = useQuery<R2Stats>({
    queryKey: ["r2-stats"],
    queryFn: fetchR2Stats,
    refetchInterval: 60_000,
  });

  const { data: images, isLoading: isLoadingImages, error } = useQuery<R2Image[]>({
    queryKey: ["r2-images", selectedFolder],
    queryFn: () => fetchR2Images(selectedFolder || undefined),
    refetchInterval: 60_000,
  });

  const filteredImages = useMemo(() => {
    if (!Array.isArray(images)) return [];
    let result = [...images];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(img =>
        img.filename.toLowerCase().includes(q) ||
        img.folder.toLowerCase().includes(q)
      );
    }

    if (sortOrder === "newest") result.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
    if (sortOrder === "oldest") result.sort((a, b) => new Date(a.lastModified).getTime() - new Date(b.lastModified).getTime());
    if (sortOrder === "az") result.sort((a, b) => a.filename.localeCompare(b.filename));
    if (sortOrder === "za") result.sort((a, b) => b.filename.localeCompare(a.filename));

    return result;
  }, [images, search, sortOrder]);

  const hasActiveFilters = search.trim() !== "" || selectedFolder !== "" || sortOrder !== "newest";
  const totalImages = Array.isArray(images) ? images.length : 0;
  const allFolders = stats?.folders ?? [];
  const topFolders = [...new Set(allFolders.map(f => f.split("/")[0]))].sort();
  const subFolders = selectedFolder
    ? allFolders.filter(f => f.startsWith(selectedFolder + "/") || f === selectedFolder).sort()
    : allFolders;

  const clearFilters = () => {
    setSearch("");
    setSelectedFolder("");
    setSortOrder("newest");
  };

  const handleImgError = (key: string) => {
    setImgErrors(prev => new Set(prev).add(key));
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground">Library</h1>
        <p className="text-muted-foreground mt-1 font-mono text-sm">
          Photos from Cloudflare R2
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Images</CardTitle>
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {isLoadingStats ? "..." : stats?.totalImages ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Folders</CardTitle>
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-primary">
              {isLoadingStats ? "..." : stats?.totalFolders ?? 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Folder tabs — top level */}
      {topFolders.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedFolder("")}
              className={`px-4 py-1.5 rounded-full text-sm font-mono transition-colors border ${
                selectedFolder === ""
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              All
            </button>
            {topFolders.map(f => (
              <button
                key={f}
                onClick={() => setSelectedFolder(selectedFolder === f ? "" : f)}
                className={`px-4 py-1.5 rounded-full text-sm font-mono transition-colors border ${
                  selectedFolder === f || selectedFolder.startsWith(f + "/")
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Sub-folders when a top folder is selected */}
          {selectedFolder && subFolders.length > 1 && (
            <div className="flex flex-wrap gap-1.5 pl-2 border-l-2 border-primary/30">
              {subFolders.map(f => (
                <button
                  key={f}
                  onClick={() => setSelectedFolder(f)}
                  className={`px-3 py-1 rounded text-xs font-mono transition-colors border ${
                    selectedFolder === f
                      ? "bg-primary/20 text-primary border-primary/50"
                      : "bg-card border-border text-muted-foreground hover:text-foreground"
                  }`}
                  title={f}
                >
                  {f.split("/").slice(1).join(" / ") || f}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Search & sort bar */}
      {!isLoadingImages && totalImages > 0 && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by filename…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 font-mono text-sm bg-card border-border"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-muted-foreground shrink-0" />
            <select
              value={sortOrder}
              onChange={e => setSortOrder(e.target.value as SortOrder)}
              className="bg-card border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="az">A → Z</option>
              <option value="za">Z → A</option>
            </select>
          </div>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground font-mono text-xs shrink-0">
              <X className="w-3 h-3 mr-1" /> Clear
            </Button>
          )}
        </div>
      )}

      {hasActiveFilters && totalImages > 0 && !isLoadingImages && (
        <p className="text-xs text-muted-foreground font-mono -mt-2">
          Showing {filteredImages.length} of {totalImages} images
        </p>
      )}

      {/* Main content */}
      {isLoadingImages ? (
        <div className="py-20 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="mt-4 text-muted-foreground font-mono text-sm">Loading images from Cloudflare R2…</p>
        </div>
      ) : error ? (
        <div className="border border-destructive/50 rounded-lg py-16 px-6 text-center bg-destructive/5">
          <Database className="w-10 h-10 text-destructive mx-auto mb-3 opacity-60" />
          <h3 className="text-base font-medium text-foreground mb-1 font-serif">Failed to load images</h3>
          <p className="text-muted-foreground text-sm font-mono">{String(error)}</p>
        </div>
      ) : filteredImages.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filteredImages.map(img => (
            <Card key={img.key} className="overflow-hidden group relative bg-secondary border-border hover:border-primary/50 transition-all duration-300">
              <CardContent className="p-0">
                <div className="aspect-square relative bg-background">
                  {imgErrors.has(img.key) ? (
                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
                      <ImageOff className="w-8 h-8 opacity-40" />
                      <span className="text-[10px] font-mono opacity-60 text-center px-2 break-all">{img.filename}</span>
                    </div>
                  ) : (
                    <img
                      src={img.url}
                      alt={img.filename}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                      onError={() => handleImgError(img.key)}
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute bottom-0 left-0 right-0 p-2 translate-y-full group-hover:translate-y-0 transition-transform">
                    <p className="text-[10px] text-gray-300 truncate font-mono" title={img.filename}>{img.filename}</p>
                    {img.folder && (
                      <p className="text-[9px] text-gray-400 truncate font-mono opacity-70">{img.folder}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : totalImages > 0 ? (
        <div className="border border-border rounded-lg py-16 px-6 text-center bg-card/30">
          <Search className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
          <h3 className="text-base font-medium text-foreground mb-1 font-serif">No images match</h3>
          <p className="text-muted-foreground text-sm mb-4">Try a different name or clear the filters.</p>
          <Button variant="outline" size="sm" onClick={clearFilters} className="font-mono text-xs">Clear filters</Button>
        </div>
      ) : (
        <div className="border-2 border-dashed border-border rounded-lg py-24 px-6 text-center bg-card/50">
          <ImageOff className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium text-foreground mb-2 font-serif">No images found in R2</h3>
          <p className="text-muted-foreground max-w-sm mx-auto mb-4 text-sm">
            Make sure your R2 bucket has images and that the public URL is correctly configured.
          </p>
          <p className="text-xs text-muted-foreground font-mono">
            Check that R2_PUBLIC_URL points to your bucket's public access URL
          </p>
        </div>
      )}
    </div>
  );
}
