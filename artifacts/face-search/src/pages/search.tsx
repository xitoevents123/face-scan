import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScanFace, Loader2, Upload, Info, Database, Square, RefreshCw, ImageOff, CheckCircle2, AlertCircle, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

interface SearchMatch {
  image_key: string;
  url: string;
  filename: string;
  score: number;
  embedding_id: string;
}

interface SearchResponse {
  matches: SearchMatch[];
  query_faces_found: number;
  total_searched: number;
}

interface IndexStatus {
  running: boolean;
  total: number;
  processed: number;
  skipped: number;
  failed: number;
  facesFound: number;
  percent: number;
  startedAt: string | null;
  finishedAt: string | null;
  currentFile: string | null;
  errors: string[];
  autoIndexed?: number;
}

export function SearchPage() {
  const [queryImage, setQueryImage] = useState<File | null>(null);
  const [queryPreviewUrl, setQueryPreviewUrl] = useState<string | null>(null);
  const [threshold, setThreshold] = useState("0.40");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [imgErrors, setImgErrors] = useState<Set<string>>(new Set());

  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null);
  const [isReindexing, setIsReindexing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/r2/index/status`);
      if (res.ok) setIndexStatus(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (indexStatus?.running) {
      pollRef.current = setInterval(fetchStatus, 2000);
    } else {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [indexStatus?.running, fetchStatus]);

  const reIndex = async () => {
    setIsReindexing(true);
    try {
      const res = await fetch(`${API_BASE}/api/r2/index`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start");
      toast({ title: "Re-indexing started", description: `Processing ${data.total} images…` });
      setTimeout(fetchStatus, 500);
    } catch (err) {
      toast({ title: "Failed to start re-index", description: String(err), variant: "destructive" });
    } finally {
      setIsReindexing(false);
    }
  };

  const stopIndexing = async () => {
    await fetch(`${API_BASE}/api/r2/index`, { method: "DELETE" });
    toast({ title: "Stopping indexing…" });
    setTimeout(fetchStatus, 1000);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setQueryImage(file);
    setSearchResult(null);
    setSearchError(null);
    const url = URL.createObjectURL(file);
    setQueryPreviewUrl(url);
  };

  const handleSearch = async () => {
    if (!queryImage) return;
    setIsSearching(true);
    setSearchError(null);
    setSearchResult(null);

    const form = new FormData();
    form.append("file", queryImage);
    form.append("threshold", threshold);

    try {
      const res = await fetch(`${API_BASE}/api/search`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setSearchResult(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSearchError(msg);
      toast({ title: "Search failed", description: msg, variant: "destructive" });
    } finally {
      setIsSearching(false);
    }
  };

  const clearQuery = () => {
    setQueryImage(null);
    setQueryPreviewUrl(null);
    setSearchResult(null);
    setSearchError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const indexed = indexStatus?.processed ?? 0;
  const total = indexStatus?.total ?? 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground">Face Search</h1>
        <p className="text-muted-foreground mt-1 font-mono text-sm">Find matching faces across all {total > 0 ? total : ""} R2 photos using AI.</p>
      </div>

      {/* Auto-Indexing Status Panel */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Database className="w-4 h-4" /> Face Index
            <span className="ml-auto flex items-center gap-1 text-[10px] text-green-500 font-mono normal-case tracking-normal">
              <Zap className="w-3 h-3" /> Auto-indexing enabled
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {indexStatus === null ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading status…
            </div>
          ) : indexStatus.running ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm font-mono">
                <span className="text-primary animate-pulse flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Indexing new images…
                </span>
                <span className="text-muted-foreground">{indexStatus.processed} / {indexStatus.total} ({indexStatus.percent}%)</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all duration-500" style={{ width: `${indexStatus.percent}%` }} />
              </div>
              <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
                <span className="truncate max-w-xs" title={indexStatus.currentFile ?? ""}>{indexStatus.currentFile ?? ""}</span>
                <span className="text-primary shrink-0 ml-2">{indexStatus.facesFound} faces found</span>
              </div>
              <Button variant="outline" size="sm" onClick={stopIndexing} className="font-mono text-xs">
                <Square className="w-3 h-3 mr-1.5" /> Stop
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2 text-sm font-mono">
                {indexed > 0 ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    <span className="text-foreground">
                      {indexed} images indexed · <span className="text-primary">{indexStatus.facesFound} faces stored</span>
                    </span>
                    {indexStatus.skipped > 0 && (
                      <span className="text-muted-foreground">({indexStatus.skipped} skipped)</span>
                    )}
                  </>
                ) : (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
                    <span className="text-muted-foreground">Scanning for new images to index…</span>
                  </>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={reIndex} disabled={isReindexing} className="font-mono text-xs">
                {isReindexing ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1.5" />}
                Re-index All
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Query */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="bg-card border-border">
            <CardContent className="pt-6 space-y-5">
              <div className="space-y-3">
                <Label className="text-xs uppercase tracking-widest text-muted-foreground">Query Photo</Label>
                {!queryPreviewUrl ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-border rounded-lg h-48 flex flex-col items-center justify-center cursor-pointer hover:bg-secondary/50 hover:border-primary/50 transition-colors"
                  >
                    <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                    <span className="text-sm font-medium">Upload a face photo</span>
                    <span className="text-xs text-muted-foreground mt-1">JPG, PNG, WEBP</span>
                  </div>
                ) : (
                  <div className="relative rounded-lg overflow-hidden border border-border group h-48 bg-black">
                    <img src={queryPreviewUrl} alt="Query" className="w-full h-full object-contain" />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Button variant="secondary" size="sm" onClick={clearQuery} className="font-mono text-xs">Change</Button>
                    </div>
                  </div>
                )}
                <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileSelect} />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label className="text-xs uppercase tracking-widest text-muted-foreground">Similarity Threshold</Label>
                  <span className="text-xs font-mono text-primary">{threshold}</span>
                </div>
                <Input
                  type="number" step="0.05" min="0" max="1"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  className="font-mono"
                />
                <p className="text-[10px] text-muted-foreground flex items-start gap-1">
                  <Info className="w-3 h-3 mt-0.5 shrink-0" />
                  Lower = more results, higher = stricter match (0.40 recommended)
                </p>
              </div>

              <Button
                className="w-full font-mono font-bold tracking-wide"
                size="lg"
                disabled={!queryImage || isSearching}
                onClick={handleSearch}
              >
                {isSearching ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <ScanFace className="w-5 h-5 mr-2" />}
                SCAN FACE
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right: Results */}
        <div className="lg:col-span-8">
          <div className="mb-4 flex items-center justify-between border-b border-border pb-2">
            <h2 className="text-sm uppercase tracking-widest font-bold text-muted-foreground">Results</h2>
            {searchResult && (
              <span className="text-xs font-mono text-primary">
                {searchResult.matches.length} matches · searched {searchResult.total_searched} embeddings
              </span>
            )}
          </div>

          {isSearching ? (
            <div className="h-64 flex flex-col items-center justify-center border border-border rounded-lg bg-card/30">
              <ScanFace className="w-12 h-12 text-primary animate-pulse mb-4" />
              <div className="text-sm font-mono text-primary animate-pulse">SCANNING FACE…</div>
            </div>
          ) : searchError ? (
            <div className="h-64 flex flex-col items-center justify-center border border-destructive/40 rounded-lg bg-destructive/5">
              <AlertCircle className="w-10 h-10 text-destructive mb-3 opacity-70" />
              <p className="text-sm font-mono text-destructive text-center px-6">{searchError}</p>
              {searchError.includes("No faces detected") && (
                <p className="text-xs text-muted-foreground mt-2 text-center px-6">Make sure the photo clearly shows a face.</p>
              )}
            </div>
          ) : !searchResult ? (
            <div className="h-64 flex items-center justify-center border border-border border-dashed rounded-lg bg-card/30">
              <span className="text-sm font-mono text-muted-foreground">AWAITING QUERY</span>
            </div>
          ) : searchResult.matches.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center border border-border rounded-lg bg-card/30">
              <ScanFace className="w-10 h-10 text-muted-foreground mb-3 opacity-50" />
              <span className="text-sm font-mono text-muted-foreground">NO MATCHES FOUND</span>
              <span className="text-xs text-muted-foreground mt-1">Try lowering the threshold or a clearer photo</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {searchResult.matches.map((match) => (
                <Card key={match.embedding_id} className="overflow-hidden group relative bg-secondary border-border hover:border-primary/50 transition-all">
                  <CardContent className="p-0">
                    <div className="aspect-square relative bg-background">
                      {imgErrors.has(match.image_key) ? (
                        <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
                          <ImageOff className="w-8 h-8 opacity-40" />
                          <span className="text-[10px] font-mono opacity-60 text-center px-2 break-all">{match.filename}</span>
                        </div>
                      ) : (
                        <img
                          src={match.url}
                          alt={match.filename}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          loading="lazy"
                          onError={() => setImgErrors(prev => new Set(prev).add(match.image_key))}
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                      <div className="absolute bottom-2 left-2 right-2">
                        <p className="text-[10px] text-gray-300 truncate font-mono">{match.filename}</p>
                        <div className="mt-1 flex items-center gap-1.5">
                          <div className="h-1.5 flex-1 bg-black/50 rounded-full overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${Math.round(match.score * 100)}%` }} />
                          </div>
                          <span className="text-xs font-mono font-bold text-primary shrink-0">{Math.round(match.score * 100)}%</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
