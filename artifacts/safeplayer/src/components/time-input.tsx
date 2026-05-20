import { Input } from "@/components/ui/input";

interface TimeInputProps {
  value: number; // total seconds (float)
  onChange: (seconds: number) => void;
}

function toHMS(totalSeconds: number) {
  const total = Math.max(0, totalSeconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.round((total % 60) * 10) / 10;
  return { h, m, s };
}

export function TimeInput({ value, onChange }: TimeInputProps) {
  const { h, m, s } = toHMS(value);

  function update(part: "h" | "m" | "s", raw: string) {
    const n = parseFloat(raw);
    const parsed = isNaN(n) ? 0 : Math.max(0, n);
    const newH = part === "h" ? Math.floor(parsed) : h;
    const newM = part === "m" ? Math.min(59, Math.floor(parsed)) : m;
    const newS = part === "s" ? Math.min(59.9, parsed) : s;
    onChange(newH * 3600 + newM * 60 + newS);
  }

  return (
    <div className="flex items-end gap-1">
      <div className="flex flex-col items-center gap-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">hr</span>
        <Input
          type="number"
          min={0}
          value={h}
          onChange={(e) => update("h", e.target.value)}
          className="w-14 text-center tabular-nums px-1"
        />
      </div>
      <span className="text-muted-foreground mb-2 font-bold">:</span>
      <div className="flex flex-col items-center gap-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">min</span>
        <Input
          type="number"
          min={0}
          max={59}
          value={m}
          onChange={(e) => update("m", e.target.value)}
          className="w-14 text-center tabular-nums px-1"
        />
      </div>
      <span className="text-muted-foreground mb-2 font-bold">:</span>
      <div className="flex flex-col items-center gap-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">sec</span>
        <Input
          type="number"
          min={0}
          max={59.9}
          step={0.1}
          value={s}
          onChange={(e) => update("s", e.target.value)}
          className="w-16 text-center tabular-nums px-1"
        />
      </div>
    </div>
  );
}
