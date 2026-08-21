import { Router } from "express";
import { eq, and, sql, count } from "drizzle-orm";
import { db, submissionsTable, mediaTable, usersTable, activityTable, jumpFramesTable, rewardsTable } from "@workspace/db";
import { ListSubmissionsQueryParams, ApproveSubmissionParams, RejectSubmissionParams } from "@workspace/api-zod";
import { POINTS_PER_FRAME } from "./rewards";

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

  // Fetch first so we can tell whether this is a fresh approval (idempotent rewards)
  const [existing] = await db
    .select()
    .from(submissionsTable)
    .where(eq(submissionsTable.id, params.data.id))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const wasAlreadyApproved = existing.status === "approved";

  const [sub] = await db
    .update(submissionsTable)
    .set({ status: "approved" })
    .where(eq(submissionsTable.id, params.data.id))
    .returning();

  // Promote the submitter's matching personal frame into the global validated
  // database. Look for any existing frame matching this submission (personal or
  // already-promoted global) so re-approval never creates a duplicate.
  const [existingFrame] = await db
    .select()
    .from(jumpFramesTable)
    .where(
      and(
        eq(jumpFramesTable.mediaId, sub.mediaId),
        eq(jumpFramesTable.submittedBy, sub.submittedBy),
        eq(jumpFramesTable.startTime, sub.startTime),
        eq(jumpFramesTable.endTime, sub.endTime),
      )
    )
    .limit(1);

  if (existingFrame) {
    // Promote to global+validated if it isn't already (idempotent on re-approval)
    if (existingFrame.source !== "global" || !existingFrame.validated) {
      await db
        .update(jumpFramesTable)
        .set({ source: "global", validated: true })
        .where(eq(jumpFramesTable.id, existingFrame.id));
    }
  } else {
    await db.insert(jumpFramesTable).values({
      mediaId: sub.mediaId,
      startTime: sub.startTime,
      endTime: sub.endTime,
      category: sub.category,
      source: "global",
      validated: true,
      submittedBy: sub.submittedBy,
    });
  }

  // Media now has a globally validated frame — mark it safe
  await db
    .update(mediaTable)
    .set({ safetyStatus: "safe" })
    .where(eq(mediaTable.id, sub.mediaId));

  // Reward the contributor — only on a fresh approval, never twice
  if (!wasAlreadyApproved) {
    const [media] = await db.select().from(mediaTable).where(eq(mediaTable.id, sub.mediaId)).limit(1);
    const reason = `Skip frame approved for "${media?.title ?? `media #${sub.mediaId}`}"`;

    await db.insert(rewardsTable).values({
      userId: sub.submittedBy,
      amount: POINTS_PER_FRAME,
      reason,
      submissionId: sub.id,
    });

    await db
      .update(usersTable)
      .set({
        points: sql`${usersTable.points} + ${POINTS_PER_FRAME}`,
        framesContributed: sql`${usersTable.framesContributed} + 1`,
      })
      .where(eq(usersTable.id, sub.submittedBy));

    await db.insert(activityTable).values({
      type: "validation",
      description: `${reason} — +${POINTS_PER_FRAME} points awarded`,
    });
  } else {
    await db.insert(activityTable).values({
      type: "validation",
      description: `Submission #${sub.id} re-approved`,
    });
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
