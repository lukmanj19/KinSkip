import { useAuth } from "@/lib/auth";
import { useState, useRef, useCallback, useEffect } from "react";
import { getBlobUrl, storeBlobUrl } from "@/lib/mediaStore";
import { getCachedFile } from "@/lib/fileCache";
import { useRoute } from "wouter";
import {
  useGetMedia, getGetMediaQueryKey,
  useListJumpFrames, useCreateJumpFrame, useDeleteJumpFrame, getListJumpFramesQueryKey,
  useVerifyPin, useUpdateMediaSafety,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck, ShieldAlert, AlertTriangle, Lock, Unlock, Flag,
  FolderOpen, Clock, X, ShieldOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { TimeInput } from "@/components/time-input";
import { VideoPlayer } from "@/components/video-player";
import { FrameTimeline } from "@/components/frame-timeline";

const jumpFrameSchema = z.object({
  startTime: z.coerce.number().min(0),
  endTime: z.coerce.number().min(0),
  category: z.enum(["violence", "sexual", "language", "other"]),
  submitToGlobal: z.boolean().default(false),
});

export default function Player() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [match, params] = useRoute("/player/:id");
  const mediaId = Number(params?.id);

  const videoRef = useRef<HTMLVideoElement>(null);
  const reloadFileRef = useRef<HTMLInputElement>(null);
  const [unfilteredToken, setUnfilteredToken] = useState<string | null>(null);
  const [isPinDialogOpen, setIsPinDialogOpen] = useState(false);
  const [isSkipFrameDialogOpen, setIsSkipFrameDialogOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [playerCurrentTime, setPlayerCurrentTime] = useState(0);
  const [playerDuration, setPlayerDuration] = useState(0);
  const [localFileName, setLocalFileName] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const hasAutoPlayedRef = useRef(false);
  // true while we're checking IndexedDB so we don't flash "file not available"
  const [checkingCache, setCheckingCache] = useState(true);

  const verifyPinMutation = useVerifyPin();
  const createJumpFrameMutation = useCreateJumpFrame();
  const deleteJumpFrameMutation = useDeleteJumpFrame();
  const updateSafetyMutation = useUpdateMediaSafety();

  // Check for ?autoplay=1 in URL
  const shouldAutoPlay = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).has("autoplay")
    : false;

  const handleProgressUpdate = useCallback((t: number, d: number) => {
    setPlayerCurrentTime(t);
    setPlayerDuration(d);
  }, []);

  const handleSeek = useCallback((time: number) => {
    if (videoRef.current) videoRef.current.currentTime = time;
  }, []);

  const handleDeleteFrame = useCallback((id: number) => {
    deleteJumpFrameMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListJumpFramesQueryKey({ mediaId }) });
          toast({ title: "Skip frame deleted" });
        },
        onError: () => toast({ title: "Failed to delete frame", variant: "destructive" }),
      }
    );
  }, [deleteJumpFrameMutation, queryClient, mediaId, toast]);

  const handleReloadFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !mediaId) return;
    storeBlobUrl(mediaId, file);
    setLocalFileName(null);
    setReloadKey((k) => k + 1);
    // Also auto-play after reloading
    hasAutoPlayedRef.current = false;
    e.target.value = "";
  }, [mediaId]);

  const { data: mediaDetail, isLoading: isMediaLoading, isError: isMediaError } = useGetMedia(mediaId, {
    query: { enabled: !!mediaId, queryKey: getGetMediaQueryKey(mediaId), retry: false },
  });

  const { data: jumpFrames, isLoading: isJumpFramesLoading } = useListJumpFrames(
    { mediaId },
    { query: { enabled: !!mediaId, queryKey: getListJumpFramesQueryKey({ mediaId }) } }
  );

  const PREVIEW_LIMIT_SECS = 35;
  const isViewerRestricted = !user || user.role !== "admin";

  // 35-second cap only applies to unreviewed content — "safe" items play fully
  const safetyStatusFromDetail = mediaDetail?.safetyStatus;
  const hasNoJumpFrames =
    !isJumpFramesLoading &&
    (jumpFrames ?? []).length === 0 &&
    safetyStatusFromDetail !== "safe";

  const [showPreviewRequired, setShowPreviewRequired] = useState(false);

  // Reset preview-required overlay whenever the media changes
  useEffect(() => { setShowPreviewRequired(false); }, [mediaId]);

  // Enforce 35-second cap for non-admins on unreviewed content
  useEffect(() => {
    if (!isViewerRestricted || !hasNoJumpFrames || showPreviewRequired) return;
    if (playerCurrentTime >= PREVIEW_LIMIT_SECS) {
      videoRef.current?.pause();
      setShowPreviewRequired(true);
    }
  }, [playerCurrentTime, isViewerRestricted, hasNoJumpFrames, showPreviewRequired]);

  // On mount: silently restore file from IndexedDB if it's not in the current session blob store.
  // This prevents the "file not available" screen for files the user has previously watched.
  useEffect(() => {
    if (!mediaDetail || mediaDetail.media.type !== "file") {
      setCheckingCache(false);
      return;
    }
    // Already have a blob URL from this session — nothing to restore
    if (getBlobUrl(mediaId)) {
      setCheckingCache(false);
      return;
    }
    let cancelled = false;
    getCachedFile(mediaId).then((cachedFile) => {
      if (cancelled) return;
      if (cachedFile) {
        storeBlobUrl(mediaId, cachedFile);
        // Trigger a re-render so VideoPlayer picks up the new blob URL
        setReloadKey((k) => k + 1);
        // Also auto-play after restoration
        hasAutoPlayedRef.current = false;
      }
      setCheckingCache(false);
    });
    return () => { cancelled = true; };
  }, [mediaId, mediaDetail]);

  // Auto-play when navigated from dashboard with ?autoplay=1
  useEffect(() => {
    if (!shouldAutoPlay || hasAutoPlayedRef.current || !videoRef.current) return;
    const vid = videoRef.current;
    const tryPlay = () => {
      if (hasAutoPlayedRef.current) return;
      hasAutoPlayedRef.current = true;
      vid.play().catch(() => {});
    };
    if (vid.readyState >= 3) {
      tryPlay();
    } else {
      vid.addEventListener("canplay", tryPlay, { once: true });
    }
    return () => vid.removeEventListener("canplay", tryPlay);
  }, [shouldAutoPlay, reloadKey]);

  const handleVerifyPin = () => {
    verifyPinMutation.mutate(
      { data: { pin } },
      {
        onSuccess: (data) => {
          if (data.valid && data.unfilteredToken) {
            setUnfilteredToken(data.unfilteredToken);
            setIsPinDialogOpen(false);
            setPin("");
            toast({ title: "Unfiltered mode enabled", description: "All content will be shown." });
          } else {
            toast({ title: "Invalid PIN", variant: "destructive" });
          }
        },
        onError: () => toast({ title: "Verification failed", variant: "destructive" }),
      }
    );
  };

  const jumpFrameForm = useForm<z.infer<typeof jumpFrameSchema>>({
    resolver: zodResolver(jumpFrameSchema),
    defaultValues: { startTime: 0, endTime: 0, category: "other", submitToGlobal: true },
  });

  const handleCreateJumpFrame = (values: z.infer<typeof jumpFrameSchema>) => {
    createJumpFrameMutation.mutate(
      { data: { ...values, mediaId } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListJumpFramesQueryKey({ mediaId }) });
          toast({ title: "Jump frame added" });
          jumpFrameForm.reset();
          setIsSkipFrameDialogOpen(false);
        },
        onError: () => toast({ title: "Failed to add jump frame", variant: "destructive" }),
      }
    );
  };

  const handleGetCurrentTime = (field: "startTime" | "endTime") => {
    if (videoRef.current) {
      jumpFrameForm.setValue(field, Math.floor(videoRef.current.currentTime * 10) / 10);
    }
  };

  const handleToggleSafety = () => {
    const newStatus = safetyStatusFromDetail === "safe" ? "unpreviewed" : "safe";
    updateSafetyMutation.mutate(
      { id: mediaId, data: { safetyStatus: newStatus } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMediaQueryKey(mediaId) });
          toast({
            title: newStatus === "safe" ? "Marked as Safe" : "Safety status cleared",
            description:
              newStatus === "safe"
                ? "Child accounts can now watch this video in full."
                : "Video is no longer marked safe — child accounts will be restricted.",
          });
        },
        onError: () => toast({ title: "Failed to update safety status", variant: "destructive" }),
      }
    );
  };

  if (!match) return null;
  if (isMediaLoading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-[60vh] w-full" />
      </div>
    );

  // Guest mode: API returned 403 (non-safe) or 404
  if (isMediaError && !user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4 max-w-md mx-auto">
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
          <ShieldAlert className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-bold">Content Restricted</h2>
        <p className="text-muted-foreground">
          This content has not been approved for unrestricted viewing. An administrator must mark it as safe before guests can watch it.
        </p>
        <div className="flex gap-3 pt-2">
          <Button variant="outline" onClick={() => window.history.back()}>Go Back</Button>
          <Button asChild><a href="/">Sign In</a></Button>
        </div>
      </div>
    );
  }

  if (!mediaDetail) return <div>Media not found</div>;

  const { media, safetyStatus } = mediaDetail;
  void reloadKey;
  const videoSrc = media.type === "file" ? (getBlobUrl(media.id) ?? undefined) : (media.url ?? undefined);
  // Don't show "file not available" until IndexedDB restore attempt is complete
  const fileMissing = !checkingCache && media.type === "file" && videoSrc === undefined && localFileName === null;

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Status Banner */}
      {safetyStatus === "safe" && (
        <div className="bg-safe text-safe-foreground p-3 rounded-lg flex items-center justify-center gap-2 font-medium">
          <ShieldCheck className="w-5 h-5" /> Safe Mode Active — Previewed &amp; Approved
        </div>
      )}
      {safetyStatus === "unpreviewed" && (
        <div className="bg-warning text-warning-foreground p-3 rounded-lg flex items-center justify-center gap-2 font-medium text-black">
          <AlertTriangle className="w-5 h-5" /> Caution: This movie has not yet been previewed.
        </div>
      )}
      {safetyStatus === "flagged" && (
        <div className="bg-danger text-danger-foreground p-3 rounded-lg flex items-center justify-center gap-2 font-medium">
          <ShieldAlert className="w-5 h-5" /> Danger: This content is flagged as potentially harmful.
        </div>
      )}

      {/* Hidden input for reloading a lost local file */}
      <input
        ref={reloadFileRef}
        type="file"
        accept="video/*,audio/*"
        className="hidden"
        onChange={handleReloadFile}
      />

      {/* Video Player */}
      <div className="rounded-xl overflow-hidden aspect-video border shadow-2xl bg-black relative">
        {fileMissing ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-white/70 p-6 text-center">
            <FolderOpen className="w-14 h-14 opacity-40" />
            <div>
              <p className="text-lg font-semibold text-white">File not available</p>
              <p className="text-sm mt-1">
                This local file isn't in the current session. Re-select it to continue watching.
              </p>
              {(jumpFrames ?? []).length > 0 && (
                <p className="text-xs mt-2 text-green-400/80">
                  ✓ {jumpFrames!.length} skip frame{jumpFrames!.length !== 1 ? "s" : ""} will be applied automatically.
                </p>
              )}
            </div>
            <button
              onClick={() => reloadFileRef.current?.click()}
              className="mt-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition"
            >
              Re-select file &amp; Play
            </button>
          </div>
        ) : (
          <VideoPlayer
            ref={videoRef}
            src={videoSrc}
            jumpFrames={jumpFrames ?? []}
            filteredMode={!unfilteredToken}
            onProgressUpdate={handleProgressUpdate}
            onLocalFileLoaded={(name) => setLocalFileName(name)}
            suppressFilePickerOnPlay={media.type === "file"}
          />
        )}

        {/* 35-second preview cap overlay for non-admin on unreviewed content */}
        {showPreviewRequired && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm text-white text-center p-6 gap-5">
            <div className="h-16 w-16 rounded-full bg-warning/20 flex items-center justify-center">
              <Clock className="w-8 h-8 text-warning" />
            </div>
            <div className="space-y-2 max-w-xs">
              <h3 className="text-xl font-bold">Preview Limit Reached</h3>
              <p className="text-sm text-white/75 leading-relaxed">
                This video hasn't been reviewed by an administrator yet. Contact your admin to preview and approve this content so you can watch the full video.
              </p>
            </div>
            <div className="flex gap-3 flex-wrap justify-center">
              <Button
                variant="outline"
                className="border-white/30 text-white hover:bg-white/10"
                onClick={() => window.history.back()}
              >
                Go Back
              </Button>
              {!user && (
                <Button asChild>
                  <a href="/">Sign In</a>
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Skip Frame Timeline */}
      {(jumpFrames ?? []).length > 0 && (
        <FrameTimeline
          jumpFrames={jumpFrames ?? []}
          duration={playerDuration}
          currentTime={playerCurrentTime}
          onSeek={handleSeek}
          onDeleteFrame={handleDeleteFrame}
          canDelete={user?.role === "admin"}
        />
      )}

      {/* Media Info + Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-card p-4 rounded-lg border">
        <div>
          <h1 className="text-xl font-bold">{localFileName ?? media.title}</h1>
          <p className="text-sm text-muted-foreground">
            {localFileName ?? (media.type === "file" ? media.fileName : media.url)}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {user?.role === "admin" && (
            <>
              {/* Mark Safe / Unmark Safe toggle */}
              {safetyStatusFromDetail === "safe" ? (
                <Button
                  variant="outline"
                  className="gap-2 text-safe border-safe hover:bg-safe/10"
                  onClick={handleToggleSafety}
                  disabled={updateSafetyMutation.isPending}
                >
                  <ShieldOff className="w-4 h-4" /> Unmark Safe
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="gap-2 text-safe border-safe hover:bg-safe/10"
                  onClick={handleToggleSafety}
                  disabled={updateSafetyMutation.isPending}
                >
                  <ShieldCheck className="w-4 h-4" /> Mark Safe
                </Button>
              )}

              {/* Add Skip Frame — Dialog overlay (keeps video playing) */}
              <Dialog open={isSkipFrameDialogOpen} onOpenChange={setIsSkipFrameDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Flag className="w-4 h-4" /> Add Skip Frame
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  {/* Shadcn DialogContent renders an X close button automatically */}
                  <DialogHeader>
                    <DialogTitle>Add Skip Frame</DialogTitle>
                    <DialogDescription>
                      Mark a segment to be automatically skipped during playback. Video continues playing while you set the timestamps.
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...jumpFrameForm}>
                    <form
                      onSubmit={jumpFrameForm.handleSubmit(handleCreateJumpFrame)}
                      className="space-y-5 mt-2"
                    >
                      <div className="space-y-4">
                        <FormField
                          control={jumpFrameForm.control}
                          name="startTime"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Start Time</FormLabel>
                              <div className="flex items-end gap-3">
                                <FormControl>
                                  <TimeInput value={field.value} onChange={field.onChange} />
                                </FormControl>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="mb-0.5 shrink-0"
                                  onClick={() => handleGetCurrentTime("startTime")}
                                >
                                  Use Current
                                </Button>
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={jumpFrameForm.control}
                          name="endTime"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>End Time</FormLabel>
                              <div className="flex items-end gap-3">
                                <FormControl>
                                  <TimeInput value={field.value} onChange={field.onChange} />
                                </FormControl>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="mb-0.5 shrink-0"
                                  onClick={() => handleGetCurrentTime("endTime")}
                                >
                                  Use Current
                                </Button>
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={jumpFrameForm.control}
                        name="category"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Category</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select a category" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="violence">Violence</SelectItem>
                                <SelectItem value="sexual">Sexual</SelectItem>
                                <SelectItem value="language">Language</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={createJumpFrameMutation.isPending}
                      >
                        Save Skip Frame
                      </Button>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>

              {/* Unfiltered Mode — Dialog overlay (keeps video playing) */}
              {unfilteredToken ? (
                <Button
                  variant="outline"
                  className="gap-2 text-warning border-warning hover:bg-warning/10"
                  onClick={() => setUnfilteredToken(null)}
                >
                  <Unlock className="w-4 h-4" /> Unfiltered (Active)
                </Button>
              ) : (
                <Dialog open={isPinDialogOpen} onOpenChange={setIsPinDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      <Lock className="w-4 h-4" /> Unlock Unfiltered
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-sm">
                    <DialogHeader>
                      <DialogTitle>Unlock Unfiltered Mode</DialogTitle>
                      <DialogDescription>
                        Enter your admin PIN to disable skip frames. Video continues playing.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <Input
                        type="password"
                        placeholder="Enter PIN"
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        maxLength={8}
                        onKeyDown={(e) => e.key === "Enter" && handleVerifyPin()}
                        autoFocus
                      />
                      <Button
                        onClick={handleVerifyPin}
                        disabled={verifyPinMutation.isPending}
                        className="w-full"
                      >
                        Verify PIN
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </>
          )}

          {user?.role === "viewer" && (
            <Button variant="outline" disabled className="gap-2 opacity-50">
              <Lock className="w-4 h-4" /> Unfiltered Locked
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
