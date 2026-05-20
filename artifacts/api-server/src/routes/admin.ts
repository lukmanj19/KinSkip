import { Router } from "express";
import { eq, count } from "drizzle-orm";
import { db, usersTable, mediaTable, submissionsTable, flaggedContentTable, activityTable } from "@workspace/db";
import { UpdateUserRoleParams, UpdateUserRoleBody } from "@workspace/api-zod";

const router = Router();

function requireAuth(req: any, res: any): number | null {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return req.session.userId as number;
}

// GET /admin/dashboard
router.get("/admin/dashboard", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [{ totalUsers }] = await db.select({ totalUsers: count() }).from(usersTable);
  const [{ totalMedia }] = await db.select({ totalMedia: count() }).from(mediaTable);
  const [{ pendingSubmissions }] = await db
    .select({ pendingSubmissions: count() })
    .from(submissionsTable)
    .where(eq(submissionsTable.status, "pending"));
  const [{ flaggedCount }] = await db
    .select({ flaggedCount: count() })
    .from(flaggedContentTable)
    .where(eq(flaggedContentTable.resolved, false));
  const [{ premiumUsers }] = await db
    .select({ premiumUsers: count() })
    .from(usersTable)
    .where(eq(usersTable.tier, "premium"));

  const activity = await db
    .select()
    .from(activityTable)
    .orderBy(activityTable.createdAt)
    .limit(10);

  res.json({
    totalUsers,
    totalMedia,
    pendingSubmissions,
    flaggedCount,
    globalFrameCount: 0,
    premiumUsers,
    recentActivity: activity.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
    })),
  });
});

// GET /admin/users
router.get("/admin/users", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
  res.json(
    users.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      role: u.role,
      tier: u.tier,
      hasPin: !!u.pinHash,
      createdAt: u.createdAt.toISOString(),
    }))
  );
});

// PATCH /admin/users/:id/role
router.patch("/admin/users/:id/role", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const params = UpdateUserRoleParams.safeParse({ id: Number(req.params.id) });
  const body = UpdateUserRoleBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const [user] = await db
    .update(usersTable)
    .set({ role: body.data.role as "admin" | "viewer" })
    .where(eq(usersTable.id, params.data.id))
    .returning();

  if (!user) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    tier: user.tier,
    hasPin: !!user.pinHash,
    createdAt: user.createdAt.toISOString(),
  });
});

// GET /admin/flagged
router.get("/admin/flagged", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const flagged = await db
    .select()
    .from(flaggedContentTable)
    .orderBy(flaggedContentTable.createdAt);

  res.json(
    flagged.map((f) => ({
      ...f,
      createdAt: f.createdAt.toISOString(),
    }))
  );
});

export default router;
