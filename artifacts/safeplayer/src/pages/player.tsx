import { useAuth } from "@/lib/auth";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { getBlobUrl } from "@/lib/mediaStore";
import { useRoute } from "wouter";
import { useGetMedia, getGetMediaQueryKey, useListJumpFrames, useCreateJumpFrame, getListJumpFramesQueryKey, useVerifyPin } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, ShieldAlert, AlertTriangle, Lock, Unlock, Flag, SkipForward, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { TimeInput } from "@/components/time-input";

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
  const [unfilteredToken, setUnfilteredToken] = useState<string | null>(null);
  const [isPinDialogOpen, setIsPinDialogOpen] = useState(false);
  const [pin, setPin] = useState("");
  const verifyPinMutation = useVerifyPin();
  const createJumpFrameMutation = useCreateJumpFrame();

  const { data: mediaDetail, isLoading: isMediaLoading } = useGetMedia(mediaId, { 
    query: { enabled: !!mediaId, queryKey: getGetMediaQueryKey(mediaId) } 
  });

  const { data: jumpFrames, isLoading: isFramesLoading } = useListJumpFrames(
    { mediaId }, 
    { query: { enabled: !!mediaId, queryKey: getListJumpFramesQueryKey({ mediaId }) } }
  );

  const [skipFlash, setSkipFlash] = useState(false);

  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current || unfilteredToken || !jumpFrames) return;
    
    const currentTime = videoRef.current.currentTime;
    
    for (const frame of jumpFrames) {
      if (currentTime >= frame.startTime && currentTime < frame.endTime) {
        videoRef.current.currentTime = frame.endTime;
        setSkipFlash(true);
        setTimeout(() => setSkipFlash(false), 500);
        toast({ title: `Skipped ${frame.category} content`, duration: 2000 });
        break;
      }
    }
  }, [jumpFrames, unfilteredToken, toast]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.addEventListener("timeupdate", handleTimeUpdate);
      return () => video.removeEventListener("timeupdate", handleTimeUpdate);
    }
  }, [handleTimeUpdate]);

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
        onError: () => {
          toast({ title: "Verification failed", variant: "destructive" });
        }
      }
    );
  };

  const jumpFrameForm = useForm<z.infer<typeof jumpFrameSchema>>({
    resolver: zodResolver(jumpFrameSchema),
    defaultValues: {
      startTime: 0,
      endTime: 0,
      category: "other",
      submitToGlobal: false,
    }
  });

  const handleCreateJumpFrame = (values: z.infer<typeof jumpFrameSchema>) => {
    createJumpFrameMutation.mutate(
      { data: { ...values, mediaId } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListJumpFramesQueryKey({ mediaId }) });
          toast({ title: "Jump frame added" });
          jumpFrameForm.reset();
        },
        onError: () => {
          toast({ title: "Failed to add jump frame", variant: "destructive" });
        }
      }
    );
  };

  const handleGetCurrentTime = (field: "startTime" | "endTime") => {
    if (videoRef.current) {
      jumpFrameForm.setValue(field, Math.floor(videoRef.current.currentTime * 10) / 10);
    }
  };

  if (!match) return null;
  if (isMediaLoading) return <div className="space-y-4"><Skeleton className="h-12 w-full"/><Skeleton className="h-[60vh] w-full"/></div>;
  if (!mediaDetail) return <div>Media not found</div>;

  const { media, safetyStatus } = mediaDetail;

  // For local files, resolve the blob URL stored when the user picked the file.
  // For URL-type entries, use the remote URL directly.
  const videoSrc = media.type === "file" ? (getBlobUrl(media.id) ?? undefined) : (media.url ?? undefined);

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Status Banner */}
      {safetyStatus === "safe" && (
        <div className="bg-safe text-safe-foreground p-3 rounded-lg flex items-center justify-center gap-2 font-medium">
          <ShieldCheck className="w-5 h-5" /> Safe Mode Active
        </div>
      )}
      {safetyStatus === "unpreviewed" && (
        <div className="bg-warning text-warning-foreground p-3 rounded-lg flex items-center justify-center gap-2 font-medium text-black">
          <AlertTriangle className="w-5 h-5" /> Caution: This movie has not yet been previewed. Exercise caution with children.
        </div>
      )}
      {safetyStatus === "flagged" && (
        <div className="bg-danger text-danger-foreground p-3 rounded-lg flex items-center justify-center gap-2 font-medium">
          <ShieldAlert className="w-5 h-5" /> Danger: This content is flagged as potentially harmful.
        </div>
      )}

      {/* Player Section */}
      <div className="relative bg-black rounded-xl overflow-hidden aspect-video border shadow-2xl">
        {media.type === "file" && !videoSrc ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-muted-foreground p-8 text-center">
            <Film className="w-12 h-12 opacity-40" />
            <p className="text-sm font-medium">Local file not available in this session.</p>
            <p className="text-xs opacity-70">Go back to the dashboard and re-select the file to play it.</p>
          </div>
        ) : (
          <video
            ref={videoRef}
            controls
            className="w-full h-full"
            src={videoSrc}
          />
        )}
        {skipFlash && (
          <div className="absolute inset-0 bg-safe/20 pointer-events-none flex items-center justify-center animate-out fade-out duration-500">
            <div className="bg-background/80 text-foreground px-6 py-3 rounded-full flex items-center gap-2 text-lg font-bold backdrop-blur-sm">
              <SkipForward className="w-6 h-6 text-safe" />
              Content Skipped
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 bg-card p-4 rounded-lg border">
        <div>
          <h1 className="text-xl font-bold">{media.title}</h1>
          <p className="text-sm text-muted-foreground">{media.type === 'file' ? media.fileName : media.url}</p>
        </div>

        <div className="flex items-center gap-3">
          {user?.role === "admin" && (
            <>
              <Drawer>
                <DrawerTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Flag className="w-4 h-4" /> Add Skip Frame
                  </Button>
                </DrawerTrigger>
                <DrawerContent>
                  <div className="mx-auto w-full max-w-lg p-6">
                    <DrawerHeader>
                      <DrawerTitle>Add Skip Frame</DrawerTitle>
                      <DrawerDescription>Mark a segment to be skipped during playback.</DrawerDescription>
                    </DrawerHeader>
                    <Form {...jumpFrameForm}>
                      <form onSubmit={jumpFrameForm.handleSubmit(handleCreateJumpFrame)} className="space-y-5 mt-4">
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
                                  <Button type="button" variant="secondary" size="sm" className="mb-0.5 shrink-0" onClick={() => handleGetCurrentTime("startTime")}>
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
                                  <Button type="button" variant="secondary" size="sm" className="mb-0.5 shrink-0" onClick={() => handleGetCurrentTime("endTime")}>
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
                        <Button type="submit" className="w-full" disabled={createJumpFrameMutation.isPending}>Save Skip Frame</Button>
                      </form>
                    </Form>
                  </div>
                </DrawerContent>
              </Drawer>

              {unfilteredToken ? (
                <Button variant="outline" className="gap-2 text-warning border-warning hover:bg-warning/10" onClick={() => setUnfilteredToken(null)}>
                  <Unlock className="w-4 h-4" /> Unfiltered Mode (Active)
                </Button>
              ) : (
                <Dialog open={isPinDialogOpen} onOpenChange={setIsPinDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      <Lock className="w-4 h-4" /> Unlock Unfiltered
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Unlock Unfiltered Mode</DialogTitle>
                      <DialogDescription>Enter your admin PIN to disable skip frames.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <Input 
                        type="password" 
                        placeholder="Enter PIN" 
                        value={pin} 
                        onChange={e => setPin(e.target.value)} 
                        maxLength={8}
                        onKeyDown={e => e.key === 'Enter' && handleVerifyPin()}
                      />
                      <Button onClick={handleVerifyPin} disabled={verifyPinMutation.isPending} className="w-full">Verify PIN</Button>
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
