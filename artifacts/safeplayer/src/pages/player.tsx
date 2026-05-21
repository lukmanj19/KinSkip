import { useAuth } from "@/lib/auth";
import { useState, useRef } from "react";
import { getBlobUrl } from "@/lib/mediaStore";
import { useRoute } from "wouter";
import {
  useGetMedia, getGetMediaQueryKey,
  useListJumpFrames, useCreateJumpFrame, getListJumpFramesQueryKey,
  useVerifyPin
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, ShieldAlert, AlertTriangle, Lock, Unlock, Flag } from "lucide-react";
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
import { VideoPlayer } from "@/components/video-player";

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

  const { data: jumpFrames } = useListJumpFrames(
    { mediaId },
    { query: { enabled: !!mediaId, queryKey: getListJumpFramesQueryKey({ mediaId }) } }
  );

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

  if (!match) return null;
  if (isMediaLoading)
    return <div className="space-y-4"><Skeleton className="h-12 w-full" /><Skeleton className="h-[60vh] w-full" /></div>;
  if (!mediaDetail) return <div>Media not found</div>;

  const { media, safetyStatus } = mediaDetail;
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
          <AlertTriangle className="w-5 h-5" /> Caution: This movie has not yet been previewed.
        </div>
      )}
      {safetyStatus === "flagged" && (
        <div className="bg-danger text-danger-foreground p-3 rounded-lg flex items-center justify-center gap-2 font-medium">
          <ShieldAlert className="w-5 h-5" /> Danger: This content is flagged as potentially harmful.
        </div>
      )}

      {/* Custom Video Player */}
      <div className="rounded-xl overflow-hidden aspect-video border shadow-2xl bg-black relative">
        <VideoPlayer
          ref={videoRef}
          src={videoSrc}
          jumpFrames={jumpFrames ?? []}
          filteredMode={!unfilteredToken}
        />
      </div>

      {/* Media Info + Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-card p-4 rounded-lg border">
        <div>
          <h1 className="text-xl font-bold">{media.title}</h1>
          <p className="text-sm text-muted-foreground">
            {media.type === "file" ? media.fileName : media.url}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {user?.role === "admin" && (
            <>
              {/* Add Skip Frame Drawer */}
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
                        <Button type="submit" className="w-full" disabled={createJumpFrameMutation.isPending}>
                          Save Skip Frame
                        </Button>
                      </form>
                    </Form>
                  </div>
                </DrawerContent>
              </Drawer>

              {/* Unfiltered Mode Toggle */}
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
                        onChange={(e) => setPin(e.target.value)}
                        maxLength={8}
                        onKeyDown={(e) => e.key === "Enter" && handleVerifyPin()}
                      />
                      <Button onClick={handleVerifyPin} disabled={verifyPinMutation.isPending} className="w-full">
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
