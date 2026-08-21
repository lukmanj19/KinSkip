import { Router } from "express";
import { eq, desc, count, gt } from "drizzle-orm";
import { db, usersTable, rewardsTable } from "@workspace/db";

const router = Router();

const POINTS_PER_FRAME = 10;

function requireAuth(req: any, res: any): number | null {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return req.session.userId as number;
}

// GET /rewards/me — current user's contribution stats + recent reward history
router.get("/rewards/me", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [user] = await db
    .select({
      points: usersTable.points,
      framesContributed: usersTable.framesContributed,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const recentRewards = await db
    .select()
    .from(rewardsTable)
    .where(eq(rewardsTable.userId, userId))
    .orderBy(desc(rewardsTable.createdAt))
    .limit(10);

  // Rank = 1 + number of users with more points
  const [{ higherCount }] = await db
    .select({ higherCount: count() })
    .from(usersTable)
    .where(gt(usersTable.points, user.points));

  res.json({
    points: user.points,
    framesContributed: user.framesContributed,
    rank: higherCount + 1,
    pointsPerFrame: POINTS_PER_FRAME,
    recentRewards: recentRewards.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

// GET /rewards/leaderboard — top community contributors
router.get("/rewards/leaderboard", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const top = await db
    .select({
      id: usersTable.id,
      displayName: usersTable.displayName,
      email: usersTable.email,
      points: usersTable.points,
      framesContributed: usersTable.framesContributed,
    })
    .from(usersTable)
    .where(gt(usersTable.points, 0))
    .orderBy(desc(usersTable.points))
    .limit(20);

  res.json(top);
});

export default router;
export { POINTS_PER_FRAME };
