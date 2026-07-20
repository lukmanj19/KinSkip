import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, submissionsTable, mediaTable, usersTable, activityTable, jumpFramesTable } from "@workspace/db";
import { ListSubmissionsQueryParams, ApproveSubmissionParams, RejectSubmissionParams } from "@workspace/api-zod";
import { count } from "drizzle-orm";

const router = Router();

function requireAuth(req: any, res: any): number | null {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return req.session.userId as number;
}

// GET /submissions
router.get("/submissions", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const parsed = ListSubmissionsQueryParams.safeParse({ status: req.query.status });

  const subs = await db.select().from(submissionsTable).orderBy(submissionsTable.createdAt);

  const filtered = parsed.success && parsed.data.status
    ? subs.filter((s) => s.status === parsed.data.status)
    : subs;

  const result = await Promise.all(
    filtered.map(async (s) => {
      const [media] = await db.select().from(mediaTable).where(eq(mediaTable.id, s.mediaId)).limit(1);
      const [submitter] = await db.select().from(usersTable).where(eq(usersTable.id, s.submittedBy)).limit(1);
      return {
        ...s,
        mediaTitle: media?.title ?? null,
        submitterEmail: submitter?.email ?? null,
        aiFlag: s.aiFlagged
          ? { flagged: true, reason: s.aiReason, severity: s.aiSeverity ?? "low" }
          : null,
        createdAt: s.createdAt.toISOString(),
      };
    })
  );

  res.json(result);
});

// POST /submissions/:id/approve
router.post("/submissions/:id/approve", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const params = ApproveSubmissionParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [sub] = await db
    .update(submissionsTable)
    .set({ status: "approved" })
    .where(eq(submissionsTable.id, params.data.id))
    .returning();

  if (!sub) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await db.insert(activityTable).values({
    type: "validation",
    description: `Submission #${sub.id} approved`,
  });

  const [media] = await db.select().from(mediaTable).where(eq(mediaTable.id, sub.mediaId)).limit(1);
  const [submitter] = await db.select().from(usersTable).where(eq(usersTable.id, sub.submittedBy)).limit(1);

  res.json({
    ...sub,
    mediaTitle: media?.title ?? null,
    submitterEmail: submitter?.email ?? null,
    aiFlag: sub.aiFlagged ? { flagged: true, reason: sub.aiReason, severity: sub.aiSeverity ?? "low" } : null,
    createdAt: sub.createdAt.toISOString(),
  });
});

// POST /submissions/:id/reject
// On rejection: delete all personal jump frames from this submitter for this media,
// then reset the media to "unpreviewed" if no frames remain.
router.post("/submissions/:id/reject", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const params = RejectSubmissionParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [sub] = await db
    .update(submissionsTable)
    .set({ status: "rejected" })
    .where(eq(submissionsTable.id, params.data.id))
    .returning();

  if (!sub) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // Delete personal jump frames for this media submitted by the same user
  await db
    .delete(jumpFramesTable)
    .where(
      and(
        eq(jumpFramesTable.mediaId, sub.mediaId),
        eq(jumpFramesTable.submittedBy, sub.submittedBy),
        eq(jumpFramesTable.source, "personal")
      )
    );

  // If no frames remain at all (personal or global), reset media to unpreviewed
  const [{ remaining }] = await db
    .select({ remaining: count() })
    .from(jumpFramesTable)
    .where(eq(jumpFramesTable.mediaId, sub.mediaId));

  if (remaining === 0) {
    await db
      .update(mediaTable)
      .set({ safetyStatus: "unpreviewed" })
      .where(eq(mediaTable.id, sub.mediaId));
  }

  const [media] = await db.select().from(mediaTable).where(eq(mediaTable.id, sub.mediaId)).limit(1);
  const [submitter] = await db.select().from(usersTable).where(eq(usersTable.id, sub.submittedBy)).limit(1);

  res.json({
    ...sub,
    mediaTitle: media?.title ?? null,
    submitterEmail: submitter?.email ?? null,
    aiFlag: sub.aiFlagged ? { flagged: true, reason: sub.aiReason, severity: sub.aiSeverity ?? "low" } : null,
    createdAt: sub.createdAt.toISOString(),
  });
});

export default router;
