import { useState, useRef, useEffect, useCallback, forwardRef } from "react";
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  Captions, SkipForward, Film, X, Upload, Globe, Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle,
} from "@/components/ui/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

interface JumpFrame {
  id: number;
  startTime: number;
  endTime: number;
  category: string;
}

interface VideoPlayerProps {
  src: string | undefined;
  jumpFrames?: JumpFrame[];
  filteredMode?: boolean;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const CATEGORY_COLORS: Record<string, string> = {
  violence: "#ef4444",
  sexual: "#a855f7",
  language: "#f59e0b",
  other: "#6b7280",
};

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function srtToVtt(text: string): string {
  return (
    "WEBVTT\n\n" +
    text
      .replace(/\r\n/g, "\n")
      .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")
      .trim()
  );
}

export const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(
  ({ src, jumpFrames = [], filteredMode = true }, forwardedRef) => {
    const { toast } = useToast();
    const internalRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const progressRef = useRef<HTMLDivElement>(null);
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const subtitleFileRef = useRef<HTMLInputElement>(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [speedIdx, setSpeedIdx] = useState(2); // 1x default
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [skipFlash, setSkipFlash] = useState(false);

    // Subtitles
    const [subtitleBlobUrl, setSubtitleBlobUrl] = useState<string | null>(null);
    const [subtitleKey, setSubtitleKey] = useState(0);
    const [subtitleLabel, setSubtitleLabel] = useState<string | null>(null);
    const [isSubDrawerOpen, setIsSubDrawerOpen] = useState(false);
    const [urlInput, setUrlInput] = useState("");
    const [isFetching, setIsFetching] = useState(false);

    // Sync forwarded ref
    useEffect(() => {
      if (!forwardedRef) return;
      if (typeof forwardedRef === "function") forwardedRef(internalRef.current);
      else forwardedRef.current = internalRef.current;
    }, [forwardedRef]);

    // Apply playback rate
    useEffect(() => {
      if (internalRef.current) internalRef.current.playbackRate = SPEEDS[speedIdx];
    }, [speedIdx]);

    // Controls auto-hide
    const resetHideTimer = useCallback(() => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setShowControls(true);
      hideTimer.current = setTimeout(() => {
        if (internalRef.current && !internalRef.current.paused) setShowControls(false);
      }, 3000);
    }, []);

    useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

    // Fullscreen listener
    useEffect(() => {
      const handler = () => setIsFullscreen(!!document.fullscreenElement);
      document.addEventListener("fullscreenchange", handler);
      return () => document.removeEventListener("fullscreenchange", handler);
    }, []);

    // Keyboard shortcuts
    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        if (!internalRef.current) return;
        if ((e.target as HTMLElement).tagName === "INPUT") return;
        switch (e.key) {
          case " ": case "k": e.preventDefault(); togglePlay(); break;
          case "ArrowLeft": e.preventDefault(); internalRef.current.currentTime -= 5; break;
          case "ArrowRight": e.preventDefault(); internalRef.current.currentTime += 5; break;
          case "ArrowUp": e.preventDefault(); setVolumeValue(Math.min(1, volume + 0.1)); break;
          case "ArrowDown": e.preventDefault(); setVolumeValue(Math.max(0, volume - 0.1)); break;
          case "m": toggleMute(); break;
          case "f": toggleFullscreen(); break;
        }
      };
      window.addEventListener("keydown", handler);
      return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [volume]);

    // Skip engine
    const handleTimeUpdate = useCallback(() => {
      const vid = internalRef.current;
      if (!vid) return;
      const t = vid.currentTime;
      setCurrentTime(t);
      if (!filteredMode) return;
      for (const frame of jumpFrames) {
        if (t >= frame.startTime && t < frame.endTime) {
          vid.currentTime = frame.endTime;
          setSkipFlash(true);
          setTimeout(() => setSkipFlash(false), 600);
          toast({ title: `Skipped ${frame.category} content`, duration: 2000 });
          break;
        }
      }
    }, [jumpFrames, filteredMode, toast]);

    // Seek bar pointer drag
    const handleProgressPointer = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        const bar = progressRef.current;
        const vid = internalRef.current;
        if (!bar || !vid || !duration) return;
        const rect = bar.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        vid.currentTime = ratio * duration;
        setCurrentTime(ratio * duration);
      },
      [duration]
    );

    const [isDragging, setIsDragging] = useState(false);
    const handleProgressDown = (e: React.PointerEvent<HTMLDivElement>) => {
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      setIsDragging(true);
      handleProgressPointer(e);
    };
    const handleProgressMove = (e: React.PointerEvent<HTMLDivElement>) => {
      if (isDragging) handleProgressPointer(e);
    };
    const handleProgressUp = () => setIsDragging(false);

    function togglePlay() {
      const vid = internalRef.current;
      if (!vid) return;
      if (vid.paused) vid.play();
      else vid.pause();
    }

    function setVolumeValue(v: number) {
      setVolume(v);
      if (internalRef.current) {
        internalRef.current.volume = v;
        internalRef.current.muted = v === 0;
        setIsMuted(v === 0);
      }
    }

    function toggleMute() {
      const vid = internalRef.current;
      if (!vid) return;
      vid.muted = !vid.muted;
      setIsMuted(vid.muted);
    }

    function toggleFullscreen() {
      if (!document.fullscreenElement) {
        containerRef.current?.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    }

    // Subtitle helpers
    function applySubtitle(vttContent: string, label: string) {
      if (subtitleBlobUrl) URL.revokeObjectURL(subtitleBlobUrl);
      const blob = new Blob([vttContent], { type: "text/vtt" });
      const url = URL.createObjectURL(blob);
      setSubtitleBlobUrl(url);
      setSubtitleKey((k) => k + 1);
      setSubtitleLabel(label);
      setIsSubDrawerOpen(false);
      toast({ title: "Subtitles loaded", description: label });
    }

    function clearSubtitles() {
      if (subtitleBlobUrl) URL.revokeObjectURL(subtitleBlobUrl);
      setSubtitleBlobUrl(null);
      setSubtitleLabel(null);
      setSubtitleKey((k) => k + 1);
    }

    function handleLocalFile(e: React.ChangeEvent<HTMLInputElement>) {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        const vtt = text.trimStart().startsWith("WEBVTT") ? text : srtToVtt(text);
        applySubtitle(vtt, file.name);
      };
      reader.readAsText(file);
    }

    async function handleFetchSubtitle() {
      if (!urlInput.trim()) return;
      setIsFetching(true);
      try {
        const res = await fetch(`/api/subtitles/proxy?url=${encodeURIComponent(urlInput.trim())}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const vtt = text.trimStart().startsWith("WEBVTT") ? text : srtToVtt(text);
        const label = urlInput.trim().split("/").pop() ?? "subtitle.vtt";
        applySubtitle(vtt, label);
        setUrlInput("");
      } catch (err) {
        toast({
          title: "Failed to fetch subtitle",
          description: String(err),
          variant: "destructive",
        });
      } finally {
        setIsFetching(false);
      }
    }

    const progress = duration ? (currentTime / duration) * 100 : 0;

    if (!src) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-muted-foreground p-8 text-center">
          <Film className="w-12 h-12 opacity-40" />
          <p className="text-sm font-medium">Local file not available in this session.</p>
          <p className="text-xs opacity-70">Go back to the dashboard and re-select the file.</p>
        </div>
      );
    }

    return (
      <div
        ref={containerRef}
        className="relative w-full h-full bg-black select-none"
        onMouseMove={resetHideTimer}
        onMouseEnter={resetHideTimer}
        onMouseLeave={() => {
          if (internalRef.current && !internalRef.current.paused) setShowControls(false);
        }}
        onClick={togglePlay}
      >
        {/* Video */}
        <video
          ref={internalRef}
          className="w-full h-full"
          src={src}
          onPlay={() => { setIsPlaying(true); resetHideTimer(); }}
          onPause={() => { setIsPlaying(false); setShowControls(true); }}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={() => setDuration(internalRef.current?.duration ?? 0)}
          onVolumeChange={() => {
            const v = internalRef.current;
            if (v) { setVolume(v.volume); setIsMuted(v.muted); }
          }}
          crossOrigin="anonymous"
        >
          {subtitleBlobUrl && (
            <track
              key={subtitleKey}
              kind="subtitles"
              src={subtitleBlobUrl}
              srcLang="en"
              label={subtitleLabel ?? "Subtitles"}
              default
            />
          )}
        </video>

        {/* Skip flash */}
        {skipFlash && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="bg-background/80 text-foreground px-6 py-3 rounded-full flex items-center gap-2 text-lg font-bold backdrop-blur-sm border">
              <SkipForward className="w-6 h-6 text-green-500" />
              Content Skipped
            </div>
          </div>
        )}

        {/* Controls overlay */}
        <div
          className="absolute inset-0 flex flex-col justify-end pointer-events-none"
          style={{
            opacity: showControls ? 1 : 0,
            transition: "opacity 0.3s ease",
          }}
        >
          {/* Gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

          {/* Controls container */}
          <div
            className="relative z-10 px-3 pb-3 pt-8 space-y-1 pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Progress bar */}
            <div
              ref={progressRef}
              className="relative h-3 group cursor-pointer"
              onPointerDown={handleProgressDown}
              onPointerMove={handleProgressMove}
              onPointerUp={handleProgressUp}
            >
              {/* Track */}
              <div className="absolute inset-y-1/2 -translate-y-1/2 w-full h-1 group-hover:h-1.5 rounded-full bg-white/20 transition-all duration-150" />
              {/* Jump frame overlays */}
              {jumpFrames.map((f) => {
                if (!duration) return null;
                const left = (f.startTime / duration) * 100;
                const width = ((f.endTime - f.startTime) / duration) * 100;
                return (
                  <div
                    key={f.id}
                    className="absolute inset-y-1/2 -translate-y-1/2 h-1 group-hover:h-1.5 rounded-full transition-all duration-150 opacity-80"
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      backgroundColor: CATEGORY_COLORS[f.category] ?? CATEGORY_COLORS.other,
                    }}
                  />
                );
              })}
              {/* Fill */}
              <div
                className="absolute inset-y-1/2 -translate-y-1/2 h-1 group-hover:h-1.5 rounded-full bg-white transition-all duration-150 pointer-events-none"
                style={{ width: `${progress}%` }}
              />
              {/* Thumb */}
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white shadow opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ left: `${progress}%` }}
              />
            </div>

            {/* Buttons row */}
            <div className="flex items-center gap-1 text-white">
              {/* Play/Pause */}
              <button
                className="p-1.5 rounded hover:bg-white/10 transition-colors"
                onClick={togglePlay}
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>

              {/* Volume */}
              <button
                className="p-1.5 rounded hover:bg-white/10 transition-colors"
                onClick={toggleMute}
              >
                {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={isMuted ? 0 : volume}
                onChange={(e) => setVolumeValue(Number(e.target.value))}
                className="w-18 h-1 accent-white cursor-pointer"
                style={{ width: "4.5rem" }}
              />

              {/* Time */}
              <span className="text-xs tabular-nums ml-1 opacity-90">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>

              <div className="flex-1" />

              {/* Speed */}
              <div className="relative group/speed">
                <button className="px-2 py-1 text-xs rounded hover:bg-white/10 font-medium transition-colors">
                  {SPEEDS[speedIdx]}×
                </button>
                <div className="absolute bottom-full right-0 mb-2 hidden group-hover/speed:flex flex-col bg-black/90 border border-white/10 rounded overflow-hidden z-20">
                  {SPEEDS.map((s, i) => (
                    <button
                      key={s}
                      className={`px-4 py-1.5 text-xs text-left hover:bg-white/10 ${i === speedIdx ? "bg-white/15 font-bold" : ""}`}
                      onClick={() => setSpeedIdx(i)}
                    >
                      {s}×
                    </button>
                  ))}
                </div>
              </div>

              {/* Subtitles */}
              <button
                className={`p-1.5 rounded transition-colors ${subtitleLabel ? "text-blue-400 bg-blue-400/10" : "hover:bg-white/10"}`}
                onClick={() => setIsSubDrawerOpen(true)}
                title="Subtitles"
              >
                <Captions className="w-5 h-5" />
              </button>

              {/* Fullscreen */}
              <button
                className="p-1.5 rounded hover:bg-white/10 transition-colors"
                onClick={toggleFullscreen}
              >
                {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Subtitle Drawer */}
        <Drawer open={isSubDrawerOpen} onOpenChange={setIsSubDrawerOpen}>
          <DrawerContent onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto w-full max-w-md p-6">
              <DrawerHeader className="px-0 pt-0">
                <DrawerTitle className="flex items-center gap-2">
                  <Captions className="w-5 h-5" /> Subtitles
                </DrawerTitle>
              </DrawerHeader>

              {subtitleLabel && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm mb-4">
                  <Check className="w-4 h-4 text-blue-400 shrink-0" />
                  <span className="text-blue-300 truncate flex-1">{subtitleLabel}</span>
                  <button
                    className="p-0.5 hover:text-red-400 transition-colors shrink-0"
                    onClick={clearSubtitles}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <Tabs defaultValue="file">
                <TabsList className="w-full mb-4">
                  <TabsTrigger value="file" className="flex-1 gap-2">
                    <Upload className="w-4 h-4" /> From Device
                  </TabsTrigger>
                  <TabsTrigger value="url" className="flex-1 gap-2">
                    <Globe className="w-4 h-4" /> From Internet
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="file" className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Pick a <code className="text-xs bg-muted px-1 py-0.5 rounded">.srt</code> or{" "}
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">.vtt</code> subtitle file
                    from your device. SRT files are converted automatically.
                  </p>
                  <input
                    ref={subtitleFileRef}
                    type="file"
                    accept=".srt,.vtt"
                    className="hidden"
                    onChange={handleLocalFile}
                  />
                  <Button
                    className="w-full gap-2"
                    onClick={() => subtitleFileRef.current?.click()}
                  >
                    <Upload className="w-4 h-4" />
                    Choose Subtitle File
                  </Button>
                </TabsContent>

                <TabsContent value="url" className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Paste a direct URL to a <code className="text-xs bg-muted px-1 py-0.5 rounded">.srt</code> or{" "}
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">.vtt</code> file. The server
                    fetches it for you, so CORS is not a problem.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="sub-url">Subtitle URL</Label>
                    <Input
                      id="sub-url"
                      placeholder="https://example.com/subtitles.srt"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleFetchSubtitle()}
                    />
                  </div>
                  <Button
                    className="w-full gap-2"
                    onClick={handleFetchSubtitle}
                    disabled={isFetching || !urlInput.trim()}
                  >
                    <Globe className="w-4 h-4" />
                    {isFetching ? "Downloading…" : "Download & Load"}
                  </Button>
                </TabsContent>
              </Tabs>
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    );
  }
);

VideoPlayer.displayName = "VideoPlayer";
