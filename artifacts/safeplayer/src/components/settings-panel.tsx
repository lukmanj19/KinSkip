import { useAuth } from "@/lib/auth";
import { useState, useEffect } from "react";
import { useSetPin, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, KeyRound, User as UserIcon, Crown, HardDrive, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { getCacheStats, clearAllCachedFiles, formatBytes } from "@/lib/fileCache";

/** Shared settings content used both in the /settings page and the slide-over Sheet. */
export function SettingsPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pin, setPin] = useState("");
  const setPinMutation = useSetPin();

  const [cacheStats, setCacheStats] = useState<{ count: number; totalBytes: number } | null>(null);
  const [clearingCache, setClearingCache] = useState(false);

  useEffect(() => {
    if (user?.role !== "admin") return;
    getCacheStats().then(setCacheStats);
  }, [user?.role]);

  const handleSetPin = () => {
    if (pin.length < 4 || pin.length > 8) {
      toast({ title: "PIN must be between 4 and 8 digits", variant: "destructive" });
      return;
    }
    setPinMutation.mutate(
      { data: { pin } },
      {
        onSuccess: () => {
          toast({ title: "Admin PIN updated successfully" });
          setPin("");
          if (user) {
            queryClient.setQueryData(getGetMeQueryKey(), { ...user, hasPin: true });
          }
        },
        onError: () => toast({ title: "Failed to update PIN", variant: "destructive" }),
      }
    );
  };

  const handleClearCache = async () => {
    setClearingCache(true);
    try {
      await clearAllCachedFiles();
      const fresh = await getCacheStats();
      setCacheStats(fresh);
      toast({ title: "Cache cleared", description: "All locally stored video files have been removed." });
    } finally {
      setClearingCache(false);
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-6">
      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserIcon className="w-4 h-4 text-primary" /> Profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border">
            <div>
              <p className="font-medium">{user.displayName || "User"}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
            <div className="flex gap-2">
              <Badge variant="outline" className="capitalize">{user.role}</Badge>
              {user.tier === "premium" ? (
                <Badge className="bg-primary text-primary-foreground gap-1">
                  <Crown className="w-3 h-3" /> Premium
                </Badge>
              ) : (
                <Badge variant="secondary">Free</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Admin-only sections */}
      {user.role === "admin" && (
        <>
          {/* Security PIN */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="w-4 h-4 text-primary" /> Security PIN
              </CardTitle>
              <CardDescription>
                Your PIN is used to unlock Unfiltered Mode during playback.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-end gap-4 max-w-sm">
                <div className="grid gap-2 flex-1">
                  <label className="text-sm font-medium">New PIN (4–8 digits)</label>
                  <Input
                    type="password"
                    placeholder="Enter new PIN"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  />
                </div>
                <Button
                  onClick={handleSetPin}
                  disabled={setPinMutation.isPending || pin.length < 4}
                >
                  {user.hasPin ? "Update PIN" : "Set PIN"}
                </Button>
              </div>
              {user.hasPin && (
                <p className="text-sm flex items-center gap-1 text-safe mt-2">
                  <Shield className="w-4 h-4" /> PIN is currently set and active.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Local File Cache Storage */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <HardDrive className="w-4 h-4 text-primary" /> Local File Cache
              </CardTitle>
              <CardDescription>
                SafePlayer stores local video files in your browser so they stay playable across sessions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {cacheStats === null ? (
                <div className="h-10 bg-muted/30 animate-pulse rounded-md" />
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-muted/30 rounded-lg border text-center">
                      <p className="text-2xl font-bold">{cacheStats.count}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {cacheStats.count === 1 ? "file cached" : "files cached"}
                      </p>
                    </div>
                    <div className="p-4 bg-muted/30 rounded-lg border text-center">
                      <p className="text-2xl font-bold">{formatBytes(cacheStats.totalBytes)}</p>
                      <p className="text-xs text-muted-foreground mt-1">total storage used</p>
                    </div>
                  </div>
                  {cacheStats.count === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No files are currently cached. Files are stored automatically when you load a local video.
                    </p>
                  ) : (
                    <div className="flex items-start justify-between gap-4 p-4 bg-destructive/5 border border-destructive/20 rounded-lg">
                      <div>
                        <p className="text-sm font-medium">Clear all cached files</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Frees up {formatBytes(cacheStats.totalBytes)} of browser storage. Jump frame data is preserved.
                        </p>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="shrink-0 gap-1.5"
                        disabled={clearingCache}
                        onClick={handleClearCache}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {clearingCache ? "Clearing…" : "Clear Cache"}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
