import { useRef } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface JumpFrame {
  id: number;
  startTime: number;
  endTime: number;
  category: string;
}

interface FrameTimelineProps {
  jumpFrames: JumpFrame[];
  duration: number;
  currentTime: number;
  onSeek: (time: number) => void;
  onDeleteFrame?: (id: number) => void;
  canDelete?: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  violence: "#ef4444",
  sexual: "#a855f7",
  language: "#f59e0b",
  other: "#6b7280",
};

const CATEGORY_BG: Record<string, string> = {
  violence: "bg-red-500/10 border-red-500/20 text-red-400",
  sexual: "bg-purple-500/10 border-purple-500/20 text-purple-400",
  language: "bg-amber-500/10 border-amber-500/20 text-amber-400",
  other: "bg-slate-500/10 border-slate-500/20 text-slate-400",
};

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

const CATEGORIES = ["violence", "sexual", "language", "other"] as const;

export function FrameTimeline({
  jumpFrames,
  duration,
  currentTime,
  onSeek,
  onDeleteFrame,
  canDelete = false,
}: FrameTimelineProps) {
  const barRef = useRef<HTMLDivElement>(null);

  const presentCategories = CATEGORIES.filter((c) =>
    jumpFrames.some((f) => f.category === c)
  );

  function seekFromClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!barRef.current || !duration) return;
    const rect = barRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(ratio * duration);
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="bg-card border rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Skip Frame Timeline</span>
          {jumpFrames.length > 0 && (
            <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
              {jumpFrames.length} {jumpFrames.length === 1 ? "frame" : "frames"}
            </span>
          )}
        </div>
        {/* Legend */}
        {presentCategories.length > 0 && (
          <div className="flex items-center gap-3">
            {presentCategories.map((cat) => (
              <div key={cat} className="flex items-center gap-1.5">
                <div
                  className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: CATEGORY_COLORS[cat] }}
                />
                <span className="text-xs text-muted-foreground capitalize">{cat}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Timeline bar */}
      <div
        ref={barRef}
        className="relative h-7 rounded-lg bg-muted/30 border border-border/50 cursor-pointer overflow-hidden group"
        onClick={seekFromClick}
        title="Click to seek"
      >
        {/* Background track */}
        <div className="absolute inset-0 bg-muted/20" />

        {/* Jump frame bands */}
        {duration > 0 &&
          jumpFrames.map((f) => {
            const left = (f.startTime / duration) * 100;
            const width = Math.max(0.3, ((f.endTime - f.startTime) / duration) * 100);
            return (
              <div
                key={f.id}
                className="absolute inset-y-0 rounded-sm opacity-70 hover:opacity-100 transition-opacity"
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  backgroundColor: CATEGORY_COLORS[f.category] ?? CATEGORY_COLORS.other,
                }}
                title={`${f.category}: ${fmt(f.startTime)} → ${fmt(f.endTime)}`}
              />
            );
          })}

        {/* Played portion overlay */}
        {duration > 0 && (
          <div
            className="absolute inset-y-0 left-0 bg-white/5 pointer-events-none"
            style={{ width: `${progress}%` }}
          />
        )}

        {/* Playhead */}
        {duration > 0 && (
          <div
            className="absolute inset-y-0 w-0.5 bg-white z-10 shadow-[0_0_4px_rgba(255,255,255,0.8)] pointer-events-none"
            style={{ left: `${progress}%` }}
          />
        )}

        {/* Time labels on hover */}
        <div className="absolute inset-0 flex items-center justify-between px-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <span className="text-[10px] text-white/70 font-mono">{fmt(0)}</span>
          {duration > 0 && (
            <span className="text-[10px] text-white/70 font-mono">{fmt(duration)}</span>
          )}
        </div>
      </div>

      {/* Time display */}
      <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
        <span>{fmt(currentTime)}</span>
        {duration > 0 && (
          <span className="text-muted-foreground/60">{fmt(duration)}</span>
        )}
      </div>

      {/* Frame list */}
      {jumpFrames.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-2">
          No skip frames yet. Add them using the{" "}
          <span className="font-medium text-foreground">Add Skip Frame</span> button above.
        </p>
      ) : (
        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
          {jumpFrames.map((f) => (
            <div
              key={f.id}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-sm cursor-pointer hover:brightness-110 transition-all ${CATEGORY_BG[f.category] ?? CATEGORY_BG.other}`}
              onClick={() => onSeek(f.startTime)}
            >
              {/* Color dot */}
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: CATEGORY_COLORS[f.category] ?? CATEGORY_COLORS.other }}
              />
              {/* Category */}
              <span className="capitalize font-medium w-16 flex-shrink-0">{f.category}</span>
              {/* Time range */}
              <span className="font-mono text-xs opacity-80 flex-1">
                {fmt(f.startTime)} → {fmt(f.endTime)}
              </span>
              {/* Duration badge */}
              <span className="text-xs opacity-60 font-mono flex-shrink-0">
                {fmt(f.endTime - f.startTime)}
              </span>
              {/* Delete */}
              {canDelete && onDeleteFrame && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-5 w-5 opacity-50 hover:opacity-100 hover:text-red-400 flex-shrink-0"
                  onClick={(e) => { e.stopPropagation(); onDeleteFrame(f.id); }}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
