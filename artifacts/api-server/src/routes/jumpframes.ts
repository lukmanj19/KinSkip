import { Router } from "express";
import { eq, and, or, count } from "drizzle-orm";
import { db, jumpFramesTable, mediaTable, submissionsTable, activityTable, flaggedContentTable } from "@workspace/db";
import {
  ListJumpFramesQueryParams,
  CreateJumpFrameBody,
  DeleteJumpFrameParams,
  ValidateJumpFrameParams,
} from "@workspace/api-zod";

const router = Router();

function requireAuth(req: any, res: any): number | null {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return req.session.userId as number;
}

function optionalAuth(req: any): number | null {
  return (req.session?.userId as number) ?? null;
}

// GET /jumpframes
router.get("/jumpframes", async (req, res): Promise<void> => {
  const userId = optionalAuth(req);

  const parsed = ListJumpFramesQueryParams.safeParse({
    mediaId: Number(req.query.mediaId),
    source: req.query.source,
  });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }

  const { mediaId } = parsed.data;

  // Guest mode: only return globally validated frames for safe media
  if (!userId) {
    const [media] = await db.select().from(mediaTable).where(eq(mediaTable.id, mediaId)).limit(1);
    if (!media || media.safetyStatus !== "safe") {
      res.json([]);
      return;
    }
    const frames = await db
      .select()
      .from(jumpFramesTable)
      .where(and(eq(jumpFramesTable.mediaId, mediaId), eq(jumpFramesTable.validated, true)))
      .orderBy(jumpFramesTable.startTime);
    res.json(frames.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() })));
    return;
  }

  const frames = await db
    .select()
    .from(jumpFramesTable)
    .where(
      and(
        eq(jumpFramesTable.mediaId, mediaId),
        or(
          and(eq(jumpFramesTable.source, "personal"), eq(jumpFramesTable.submittedBy, userId)),
          and(eq(jumpFramesTable.source, "global"), eq(jumpFramesTable.validated, true))
        )
      )
    )
    .orderBy(jumpFramesTable.startTime);

  res.json(frames.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() })));
});

// POST /jumpframes
router.post("/jumpframes", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const parsed = CreateJumpFrameBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { mediaId, startTime, endTime, category, submitToGlobal } = parsed.data;

  if (endTime <= startTime) {
    res.status(400).json({ error: "endTime must be greater than startTime" });
    return;
  }

  // AI guardrails: flag sexual/violence submissions
  const isExtremeContent = category === "sexual";
  let aiFlagged = false;
  let aiSeverity = "low";
  let aiReason: string | null = null;

  if (isExtremeContent) {
    aiFlagged = true;
    aiSeverity = "extreme";
    aiReason = "Submission categorized as sexual content — blocked for admin review";
  } else if (category === "violence") {
    aiFlagged = true;
    aiSeverity = "high";
    aiReason = "Submission categorized as violence — flagged for admin review";
  }

  const [frame] = await db
    .insert(jumpFramesTable)
    .values({
      mediaId,
      startTime,
      endTime,
      category: category as "violence" | "sexual" | "language" | "other",
      source: "personal",
      validated: false,
      submittedBy: userId,
    })
    .returning();

  // Media has at least one frame — mark as safe
  await db
    .update(mediaTable)
    .set({ safetyStatus: "safe" })
    .where(eq(mediaTable.id, mediaId));

  if (submitToGlobal || aiFlagged) {
    const [sub] = await db
      .insert(submissionsTable)
      .values({
        mediaId,
        startTime,
        endTime,
        category: category as "violence" | "sexual" | "language" | "other",
        status: aiFlagged ? "flagged" : "pending",
        submittedBy: userId,
        aiFlagged,
        aiReason,
        aiSeverity,
      })
      .returning();

    if (aiFlagged) {
      await db.insert(flaggedContentTable).values({
        type: "submission",
        severity: aiSeverity as "extreme" | "high" | "low",
        reason: aiReason ?? "AI flagged",
        resolved: false,
        referenceId: sub.id,
      });
    }
  }

  res.status(201).json({ ...frame, createdAt: frame.createdAt.toISOString() });
});

// DELETE /jumpframes/:id
router.delete("/jumpframes/:id", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const params = DeleteJumpFrameParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  // Fetch the frame first so we know its mediaId
  const [frame] = await db
    .select()
    .from(jumpFramesTable)
    .where(eq(jumpFramesTable.id, params.data.id))
    .limit(1);

  if (!frame) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const mediaId = frame.mediaId;

  await db
    .delete(jumpFramesTable)
    .where(
      and(
        eq(jumpFramesTable.id, params.data.id),
        eq(jumpFramesTable.submittedBy, userId)
      )
    );

  // After deletion: if no frames remain for this media, reset its safety to unpreviewed
  const [{ remaining }] = await db
    .select({ remaining: count() })
    .from(jumpFramesTable)
    .where(eq(jumpFramesTable.mediaId, mediaId));

  if (remaining === 0) {
    await db
      .update(mediaTable)
      .set({ safetyStatus: "unpreviewed" })
      .where(eq(mediaTable.id, mediaId));
  }

  res.status(204).send();
});

// POST /jumpframes/:id/validate
router.post("/jumpframes/:id/validate", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const params = ValidateJumpFrameParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [frame] = await db
    .update(jumpFramesTable)
    .set({ source: "global", validated: true })
    .where(eq(jumpFramesTable.id, params.data.id))
    .returning();

  if (!frame) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await db.insert(activityTable).values({
    type: "validation",
    description: `Jump frame #${frame.id} validated into global database`,
  });

  res.json({ ...frame, createdAt: frame.createdAt.toISOString() });
});

export default router;
