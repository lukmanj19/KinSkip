import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useListMedia, useCreateMedia, getListMediaQueryKey, useLookupMedia } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ShieldAlert, ShieldCheck, Shield, Plus, Film, Link as LinkIcon, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: mediaItems, isLoading } = useListMedia();
  
  const createMediaMutation = useCreateMedia();
  
  const [urlInput, setUrlInput] = useState("");

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    createMediaMutation.mutate(
      { data: { type: "url", url: urlInput, title: urlInput.split('/').pop() || "Video" } },
      {
        onSuccess: () => {
          setUrlInput("");
          queryClient.invalidateQueries({ queryKey: getListMediaQueryKey() });
          toast({ title: "Media added" });
        },
        onError: () => {
          toast({ title: "Failed to add media", variant: "destructive" });
        }
      }
    );
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileHash = `${file.size}-${file.name}`;
    
    // In a real app, we'd lookup first. For simplicity here, we just create.
    createMediaMutation.mutate(
      { data: { type: "file", fileName: file.name, fileHash, title: file.name.replace(/\.[^/.]+$/, ""), mimeType: file.type } },
      {
        onSuccess: (newMedia) => {
          queryClient.invalidateQueries({ queryKey: getListMediaQueryKey() });
          toast({ title: "File prepared", description: "You can now play it." });
          // Store actual file in session/state for the player if needed, but since it's local we usually use an object URL.
          // For this mockup, we just assume player uses file picker if not passed.
        },
        onError: () => {
          toast({ title: "Failed to process file", variant: "destructive" });
        }
      }
    );
  };

  const StatusBadge = ({ status }: { status: string }) => {
    if (status === "safe") {
      return (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-safe/10 text-safe border border-safe/20">
          <ShieldCheck className="w-3.5 h-3.5" />
          Safe Mode
        </div>
      );
    }
    if (status === "flagged") {
      return (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-danger/10 text-danger border border-danger/20">
          <ShieldAlert className="w-3.5 h-3.5" />
          Flagged
        </div>
      );
    }
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-warning/10 text-warning border border-warning/20">
        <AlertTriangle className="w-3.5 h-3.5" />
        Un-Previewed
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Library</h1>
        <p className="text-muted-foreground mt-1">Select media to play with SafeMode.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Film className="w-5 h-5 text-primary" />
              Local File
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">Play a video file from your device. The file never leaves your computer.</p>
            <div className="relative">
              <Input type="file" accept="video/*" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              <Button variant="outline" className="w-full gap-2 pointer-events-none">
                <Plus className="w-4 h-4" /> Select File
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <LinkIcon className="w-5 h-5 text-primary" />
              Network Stream
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUrlSubmit} className="space-y-4">
              <p className="text-sm text-muted-foreground">Load a video from a direct URL (.mp4, .m3u8).</p>
              <div className="flex gap-2">
                <Input placeholder="https://..." value={urlInput} onChange={(e) => setUrlInput(e.target.value)} />
                <Button type="submit" disabled={createMediaMutation.isPending}>Load</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4">Recent Media</h2>
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full" />)}
          </div>
        ) : mediaItems?.length === 0 ? (
          <div className="text-center py-12 border border-dashed rounded-lg">
            <Shield className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground">No media yet</h3>
            <p className="text-sm text-muted-foreground">Load a file or URL above to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {mediaItems?.map(media => (
              <Card key={media.id} className="hover-elevate transition-colors group">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-base truncate pr-4" title={media.title}>{media.title}</CardTitle>
                    <StatusBadge status={media.safetyStatus} />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground truncate">{media.type === 'file' ? media.fileName : media.url}</p>
                  {media.jumpFrameCount !== undefined && (
                    <p className="text-xs text-muted-foreground mt-2">{media.jumpFrameCount} skip frames mapped</p>
                  )}
                </CardContent>
                <CardFooter>
                  <Button asChild className="w-full opacity-0 group-hover:opacity-100 transition-opacity">
                    <Link href={`/player/${media.id}`}>Play</Link>
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
