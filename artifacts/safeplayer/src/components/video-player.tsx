import { useState, useRef, useEffect, useCallback, forwardRef } from "react";
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  Captions, SkipForward, SkipBack, Square, Film, X, Upload, Globe, Check,
  FolderOpen, Shuffle, Music, FileVideo, ListMusic
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
  onProgressUpdate?: (currentTime: number, duration: number) => void;
  onLocalFileLoaded?: (fileName: string) => void;
  suppressFilePickerOnPlay?: boolean;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const CATEGORY_COLORS: Record<string, string> = {
  violence: "#ef4444",
  sexual: "#a855f7",
  language: "#f59e0b",
  other: "#6b7280",
};

const MEDIA_ACCEPT = "video/*,audio/*,.mp4,.mkv,.webm,.avi,.mov,.mp3,.flac,.wav,.aac,.ogg,.m4a";

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

function shuffleArr<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function shortName(name: string, maxLen = 42): string {
  return name.length > maxLen ? name.slice(0, maxLen - 1) + "…" : name;
}

export const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(
  ({ src, jumpFrames = [], filteredMode = true, onProgressUpdate, onLocalFileLoaded, suppressFilePickerOnPlay }, forwardedRef) => {
    const { toast } = useToast();
    const internalRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const progressRef = useRef<HTMLDivElement>(null);
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const subtitleFileRef = useRef<HTMLInputElement>(null);
    const mediaFileRef = useRef<HTMLInputElement>(null);
    const folderFileRef = useRef<HTMLInputElement>(null);

    // Playback state
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [speedIdx, setSpeedIdx] = useState(2);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [skipFlash, setSkipFlash] = useState(false);
    const [showOpenMenu, setShowOpenMenu] = useState(false);

    // Playlist / local override
    const [playlist, setPlaylist] = useState<File[]>([]);
    const [playlistIdx, setPlaylistIdx] = useState(0);
    const [isShuffled, setIsShuffled] = useState(false);
    const [shuffleOrder, setShuffleOrder] = useState<number[]>([]);
    const [localSrc, setLocalSrc] = useState<string | null>(null);
    const [isAudio, setIsAudio] = useState(false);
    const [trackName, setTrackName] = useState<string | null>(null);

    // Subtitles
    const [subtitleBlobUrl, setSubtitleBlobUrl] = useState<string | null>(null);
    const [subtitleKey, setSubtitleKey] = useState(0);
    const [subtitleLabel, setSubtitleLabel] = useState<string | null>(null);
    const [isSubDrawerOpen, setIsSubDrawerOpen] = useState(false);
    const [urlInput, setUrlInput] = useState("");
    const [isFetching, setIsFetching] = useState(false);

    const effectiveSrc = localSrc ?? src;
    // Only apply DB jump frames when playing the DB-backed source; clear them for locally-opened files
    const effectiveJumpFrames = localSrc ? [] : jumpFrames;

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

    // Apply volume on mount
    useEffect(() => {
      if (internalRef.current) internalRef.current.volume = 1;
    }, []);

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
        const vid = internalRef.current;
        if (!vid) return;
        if ((e.target as HTMLElement).tagName === "INPUT") return;
        switch (e.key) {
          case " ": case "k": e.preventDefault(); togglePlay(); break;
          case "ArrowLeft": e.preventDefault(); vid.currentTime = Math.max(0, vid.currentTime - 10); break;
          case "ArrowRight": e.preventDefault(); vid.currentTime = Math.min(duration, vid.currentTime + 10); break;
          case "ArrowUp": e.preventDefault(); setVolumeValue(Math.min(1, volume + 0.1)); break;
          case "ArrowDown": e.preventDefault(); setVolumeValue(Math.max(0, volume - 0.1)); break;
          case "m": toggleMute(); break;
          case "f": toggleFullscreen(); break;
          case "n": nextTrack(); break;
          case "p": prevTrack(); break;
          case "s": stopPlayback(); break;
        }
      };
      window.addEventListener("keydown", handler);
      return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [volume, duration, playlist, playlistIdx, isShuffled, shuffleOrder, localSrc]);

    // Skip engine + progress broadcast
    const handleTimeUpdate = useCallback(() => {
      const vid = internalRef.current;
      if (!vid) return;
      const t = vid.currentTime;
      setCurrentTime(t);
      onProgressUpdate?.(t, vid.duration || 0);
      if (!filteredMode) return;
      for (const frame of effectiveJumpFrames) {
        if (t >= frame.startTime && t < frame.endTime) {
          vid.currentTime = frame.endTime;
          setSkipFlash(true);
          setTimeout(() => setSkipFlash(false), 600);
          toast({ title: `Skipped ${frame.category} content`, duration: 2000 });
          break;
        }
      }
    }, [effectiveJumpFrames, filteredMode, toast, onProgressUpdate]);

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

    // ─── Playlist helpers ────────────────────────────────────────────────────

    function loadTrack(idx: number, files: File[], order: number[], shuffled: boolean) {
      const len = files.length;
      if (len === 0) return;
      const clampedIdx = ((idx % len) + len) % len;
      const actualIdx = shuffled ? order[clampedIdx] : clampedIdx;
      const file = files[actualIdx];
      if (!file) return;
      if (localSrc) URL.revokeObjectURL(localSrc);
      const url = URL.createObjectURL(file);
      setLocalSrc(url);
      setTrackName(file.name);
      setPlaylistIdx(clampedIdx);
      setIsAudio(file.type.startsWith("audio/"));
      onLocalFileLoaded?.(file.name);
      setTimeout(() => { internalRef.current?.play().catch(() => {}); }, 80);
    }

    function openFiles(files: File[]) {
      if (!files.length) return;
      const media = files.filter(
        (f) => f.type.startsWith("video/") || f.type.startsWith("audio/") || !f.type
      );
      if (!media.length) { toast({ title: "No media files found", variant: "destructive" }); return; }
      const order = shuffleArr(Array.from({ length: media.length }, (_, i) => i));
      setPlaylist(media);
      setShuffleOrder(order);
      setPlaylistIdx(0);
      loadTrack(0, media, order, isShuffled);
      toast({
        title: media.length === 1 ? `Loaded: ${shortName(media[0].name)}` : `Playlist: ${media.length} files`,
      });
    }

    function nextTrack() {
      if (playlist.length === 0) return;
      loadTrack(playlistIdx + 1, playlist, shuffleOrder, isShuffled);
    }

    function prevTrack() {
      if (playlist.length === 0) return;
      // If more than 3s into track, restart it instead
      if ((internalRef.current?.currentTime ?? 0) > 3) {
        if (internalRef.current) internalRef.current.currentTime = 0;
        return;
      }
      loadTrack(playlistIdx - 1, playlist, shuffleOrder, isShuffled);
    }

    function toggleShuffle() {
      const next = !isShuffled;
      setIsShuffled(next);
      if (next && playlist.length > 0) {
        setShuffleOrder(shuffleArr(Array.from({ length: playlist.length }, (_, i) => i)));
      }
      toast({ title: next ? "Shuffle on" : "Shuffle off" });
    }

    // ─── Playback controls ───────────────────────────────────────────────────

    function togglePlay() {
      const vid = internalRef.current;
      if (!effectiveSrc) {
        if (!suppressFilePickerOnPlay) mediaFileRef.current?.click();
        return;
      }
      if (!vid) return;
      if (vid.paused) vid.play();
      else vid.pause();
    }

    function stopPlayback() {
      const vid = internalRef.current;
      if (!vid) return;
      vid.pause();
      vid.currentTime = 0;
      setIsPlaying(false);
      setCurrentTime(0);
    }

    function seekBy(sec: number) {
      const vid = internalRef.current;
      if (!vid || !effectiveSrc) return;
      vid.currentTime = Math.max(0, Math.min(vid.duration || 0, vid.currentTime + sec));
    }

    function setVolumeValue(v: number) {
      const clamped = Math.max(0, Math.min(1, v));
      setVolume(clamped);
      if (internalRef.current) {
        internalRef.current.volume = clamped;
        internalRef.current.muted = clamped === 0;
        setIsMuted(clamped === 0);
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

    // ─── Subtitle helpers ────────────────────────────────────────────────────

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

    function handleSubtitleFile(e: React.ChangeEvent<HTMLInputElement>) {
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
        toast({ title: "Failed to fetch subtitle", description: String(err), variant: "destructive" });
      } finally {
        setIsFetching(false);
      }
    }

    // ─── Derived ─────────────────────────────────────────────────────────────

    const progress = duration ? (currentTime / duration) * 100 : 0;
    const hasPlaylist = playlist.length > 1;

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
      <div
        ref={containerRef}
        className="absolute inset-0 bg-black select-none"
        onMouseMove={resetHideTimer}
        onMouseEnter={resetHideTimer}
        onMouseLeave={() => {
          if (internalRef.current && !internalRef.current.paused) setShowControls(false);
        }}
        onClick={(e) => { if (e.target === containerRef.current || (e.target as HTMLElement).tagName === "VIDEO") togglePlay(); }}
      >
        {/* Hidden file inputs */}
        <input
          ref={mediaFileRef}
          type="file"
          accept={MEDIA_ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => { openFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }}
        />
        <input
          ref={folderFileRef}
          type="file"
          accept={MEDIA_ACCEPT}
          className="hidden"
          // @ts-expect-error webkitdirectory is not in types
          webkitdirectory=""
          onChange={(e) => { openFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }}
        />
        <input
          ref={subtitleFileRef}
          type="file"
          accept=".srt,.vtt"
          className="hidden"
          onChange={handleSubtitleFile}
        />

        {/* No media placeholder */}
        {!effectiveSrc && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-white/60 z-10 pointer-events-none">
            <Film className="w-16 h-16 opacity-30" />
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold opacity-80">No media loaded</p>
              <p className="text-xs opacity-50">Press ▶ to open a file, or use the folder button</p>
            </div>
          </div>
        )}

        {/* Audio player visual */}
        {isAudio && effectiveSrc && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 z-0 pointer-events-none">
            <div className={`w-28 h-28 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-2xl ${isPlaying ? "animate-spin" : ""}`} style={{ animationDuration: "8s" }}>
              <Music className="w-12 h-12 text-white" />
            </div>
            {trackName && (
              <div className="text-center px-8">
                <p className="text-white font-semibold text-sm">{shortName(trackName, 60)}</p>
                {hasPlaylist && (
                  <p className="text-white/50 text-xs mt-1">{playlistIdx + 1} / {playlist.length}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Video element */}
        <video
          ref={internalRef}
          className={`w-full h-full ${isAudio ? "opacity-0 pointer-events-none" : ""}`}
          src={effectiveSrc}
          onPlay={() => { setIsPlaying(true); resetHideTimer(); }}
          onPause={() => { setIsPlaying(false); setShowControls(true); }}
          onEnded={() => {
            setIsPlaying(false);
            if (hasPlaylist) nextTrack();
          }}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={() => {
            const d = internalRef.current?.duration ?? 0;
            setDuration(d);
            onProgressUpdate?.(0, d);
            if (internalRef.current) internalRef.current.volume = 1;
          }}
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
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20">
            <div className="bg-background/80 text-foreground px-6 py-3 rounded-full flex items-center gap-2 text-lg font-bold backdrop-blur-sm border">
              <SkipForward className="w-6 h-6 text-green-500" />
              Content Skipped
            </div>
          </div>
        )}

        {/* Controls overlay */}
        <div
          className="absolute inset-0 flex flex-col justify-end pointer-events-none z-30"
          style={{ opacity: showControls ? 1 : 0, transition: "opacity 0.3s ease" }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent pointer-events-none" />

          <div
            className="relative z-10 px-3 pb-2 pt-6 space-y-1 pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Progress bar */}
            <div
              ref={progressRef}
              className="relative h-4 group cursor-pointer"
              onPointerDown={handleProgressDown}
              onPointerMove={handleProgressMove}
              onPointerUp={handleProgressUp}
            >
              <div className="absolute inset-y-1/2 -translate-y-1/2 w-full h-1 group-hover:h-1.5 rounded-full bg-white/20 transition-all duration-150" />
              {effectiveJumpFrames.map((f) => {
                if (!duration) return null;
                const left = (f.startTime / duration) * 100;
                const width = ((f.endTime - f.startTime) / duration) * 100;
                return (
                  <div
                    key={f.id}
                    className="absolute inset-y-1/2 -translate-y-1/2 h-1 group-hover:h-1.5 rounded-full transition-all duration-150 opacity-80"
                    style={{ left: `${left}%`, width: `${width}%`, backgroundColor: CATEGORY_COLORS[f.category] ?? CATEGORY_COLORS.other }}
                  />
                );
              })}
              <div
                className="absolute inset-y-1/2 -translate-y-1/2 h-1 group-hover:h-1.5 rounded-full bg-white transition-all duration-150 pointer-events-none"
                style={{ width: `${progress}%` }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white shadow opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ left: `${progress}%` }}
              />
            </div>

            {/* Controls bar */}
            <div className="flex items-center gap-0.5 text-white">
              {/* ── Transport ── */}

              {/* Prev track */}
              <button
                className={`p-1.5 rounded transition-colors ${hasPlaylist ? "hover:bg-white/10" : "opacity-30 cursor-default"}`}
                onClick={prevTrack}
                title="Previous (P)"
              >
                <SkipBack className="w-4 h-4" />
              </button>

              {/* Seek back 10s */}
              <button
                className="p-1.5 rounded hover:bg-white/10 transition-colors relative"
                onClick={() => seekBy(-10)}
                title="Rewind 10s (←)"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <text x="12" y="14" fontSize="6" textAnchor="middle" fill="currentColor" stroke="none" fontWeight="bold">10</text>
                </svg>
              </button>

              {/* Stop */}
              <button
                className="p-1.5 rounded hover:bg-white/10 transition-colors"
                onClick={stopPlayback}
                title="Stop (S)"
              >
                <Square className="w-4 h-4 fill-white" />
              </button>

              {/* Play / Pause */}
              <button
                className="p-1.5 rounded hover:bg-white/10 transition-colors"
                onClick={togglePlay}
                title={isPlaying ? "Pause (Space)" : "Play (Space)"}
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>

              {/* Seek forward 10s */}
              <button
                className="p-1.5 rounded hover:bg-white/10 transition-colors"
                onClick={() => seekBy(10)}
                title="Forward 10s (→)"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                  <path d="M21 3v5h-5" />
                  <text x="12" y="14" fontSize="6" textAnchor="middle" fill="currentColor" stroke="none" fontWeight="bold">10</text>
                </svg>
              </button>

              {/* Next track */}
              <button
                className={`p-1.5 rounded transition-colors ${hasPlaylist ? "hover:bg-white/10" : "opacity-30 cursor-default"}`}
                onClick={nextTrack}
                title="Next (N)"
              >
                <SkipForward className="w-4 h-4" />
              </button>

              {/* Track info */}
              {trackName && (
                <span className="ml-1 text-xs opacity-70 truncate max-w-[140px]" title={trackName}>
                  {shortName(trackName, 22)}
                  {hasPlaylist && <span className="opacity-50 ml-1">{playlistIdx + 1}/{playlist.length}</span>}
                </span>
              )}

              {/* ── Volume ── */}
              <button
                className="ml-1 p-1.5 rounded hover:bg-white/10 transition-colors"
                onClick={toggleMute}
                title="Mute (M)"
              >
                {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={isMuted ? 0 : volume}
                onChange={(e) => setVolumeValue(Number(e.target.value))}
                className="h-1 accent-white cursor-pointer"
                style={{ width: "4rem" }}
              />

              {/* Time */}
              <span className="text-xs tabular-nums ml-1 opacity-80 whitespace-nowrap">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>

              <div className="flex-1" />

              {/* ── Right controls ── */}

              {/* Shuffle */}
              <button
                className={`p-1.5 rounded transition-colors ${isShuffled ? "text-green-400 bg-green-400/10" : "hover:bg-white/10"}`}
                onClick={toggleShuffle}
                title="Shuffle"
              >
                <Shuffle className="w-4 h-4" />
              </button>

              {/* Open media/folder */}
              <div className="relative">
                <button
                  className="p-1.5 rounded hover:bg-white/10 transition-colors"
                  onClick={() => setShowOpenMenu((v) => !v)}
                  title="Open media"
                >
                  <FolderOpen className="w-4 h-4" />
                </button>
                {showOpenMenu && (
                  <div
                    className="absolute bottom-full right-0 mb-2 bg-black/90 border border-white/10 rounded-lg overflow-hidden z-50 w-44"
                    onMouseLeave={() => setShowOpenMenu(false)}
                  >
                    <button
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-xs hover:bg-white/10 transition-colors text-left"
                      onClick={() => { setShowOpenMenu(false); mediaFileRef.current?.click(); }}
                    >
                      <FileVideo className="w-3.5 h-3.5 shrink-0" />
                      Open file(s)
                    </button>
                    <button
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-xs hover:bg-white/10 transition-colors text-left"
                      onClick={() => { setShowOpenMenu(false); folderFileRef.current?.click(); }}
                    >
                      <ListMusic className="w-3.5 h-3.5 shrink-0" />
                      Open folder
                    </button>
                  </div>
                )}
              </div>

              {/* Speed */}
              <div className="relative group/speed">
                <button className="px-1.5 py-1 text-xs rounded hover:bg-white/10 font-medium transition-colors">
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
                <Captions className="w-4 h-4" />
              </button>

              {/* Fullscreen */}
              <button
                className="p-1.5 rounded hover:bg-white/10 transition-colors"
                onClick={toggleFullscreen}
                title="Fullscreen (F)"
              >
                {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
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
                  <button className="p-0.5 hover:text-red-400 transition-colors shrink-0" onClick={clearSubtitles}>
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
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">.vtt</code> subtitle file.
                  </p>
                  <Button className="w-full gap-2" onClick={() => subtitleFileRef.current?.click()}>
                    <Upload className="w-4 h-4" /> Choose Subtitle File
                  </Button>
                </TabsContent>

                <TabsContent value="url" className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Paste a direct URL to a subtitle file. CORS is handled server-side.
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
