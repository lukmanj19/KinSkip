import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Award, Medal, Sparkles, Star, Crown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface MyRewards {
  points: number;
  framesContributed: number;
  rank: number;
  pointsPerFrame: number;
  recentRewards: {
    id: number;
    amount: number;
    reason: string;
    createdAt: string;
  }[];
}

interface LeaderEntry {
  id: number;
  displayName: string | null;
  email: string;
  points: number;
  framesContributed: number;
}

const RANK_STYLES = [
  { icon: Crown, className: "text-yellow-500", label: "1st" },
  { icon: Medal, className: "text-slate-400", label: "2nd" },
  { icon: Award, className: "text-amber-600", label: "3rd" },
];

export default function Community() {
  const { user } = useAuth();

  const { data: myRewards, isLoading: myLoading } = useQuery<MyRewards>({
    queryKey: ["rewards-me"],
    queryFn: async () => {
      const r = await fetch("/api/rewards/me", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load rewards");
      return r.json();
    },
    enabled: !!user,
  });

  const { data: leaderboard, isLoading: lbLoading } = useQuery<LeaderEntry[]>({
    queryKey: ["rewards-leaderboard"],
    queryFn: async () => {
      const r = await fetch("/api/rewards/leaderboard", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load leaderboard");
      return r.json();
    },
    enabled: !!user,
  });

  if (!user) return null;

  const myRank = myRewards?.rank;
  const myPoints = myRewards?.points ?? 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Trophy className="w-7 h-7 text-primary" /> Community
        </h1>
        <p className="text-muted-foreground mt-1">
          Earn points by submitting skip frames that get approved into the global database.
          Help protect other families and climb the leaderboard.
        </p>
      </div>

      {/* My stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Your Points</CardTitle>
            <Star className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            {myLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{myPoints}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {myRewards?.pointsPerFrame ?? 10} pts per approved frame
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Frames Contributed</CardTitle>
            <Sparkles className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            {myLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{myRewards?.framesContributed ?? 0}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Approved into global DB</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Your Rank</CardTitle>
            <Trophy className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            {myLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">#{myRank ?? "—"}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {myPoints > 0 ? "Keep contributing to climb!" : "Submit a frame to get ranked"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary" /> Leaderboard
          </CardTitle>
          <CardDescription>Top community contributors by reward points.</CardDescription>
        </CardHeader>
        <CardContent>
          {lbLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !leaderboard || leaderboard.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Trophy className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No contributors yet. Be the first to submit an approved skip frame!</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Rank</TableHead>
                  <TableHead>Contributor</TableHead>
                  <TableHead className="text-right">Frames</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaderboard.map((entry, idx) => {
                  const rank = RANK_STYLES[idx];
                  const isMe = entry.id === user.id;
                  return (
                    <TableRow key={entry.id} className={isMe ? "bg-primary/5" : undefined}>
                      <TableCell>
                        {rank ? (
                          <span className={`flex items-center gap-1 font-semibold ${rank.className}`}>
                            <rank.icon className="w-4 h-4" /> {rank.label}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">#{idx + 1}</span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {entry.displayName || entry.email}
                        {isMe && (
                          <Badge variant="secondary" className="ml-2 text-xs">You</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{entry.framesContributed}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{entry.points}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recent rewards history */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="w-5 h-5 text-primary" /> Your Reward History
          </CardTitle>
          <CardDescription>Recent points you've earned from approved submissions.</CardDescription>
        </CardHeader>
        <CardContent>
          {myLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !myRewards?.recentRewards || myRewards.recentRewards.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Award className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                No rewards yet. Submit a skip frame from the player and get it approved to earn points.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                  <TableHead className="text-right">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {myRewards.recentRewards.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.reason}</TableCell>
                    <TableCell className="text-right">
                      <Badge className="bg-primary text-primary-foreground">+{r.amount}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
