import { Router } from "express";
import { eq, and, desc, or } from "drizzle-orm";
import { db, mediaTable, jumpFramesTable, usersTable } from "@workspace/db";
import { CreateMediaBody, GetMediaParams, DeleteMediaParams, LookupMediaBody, UpdateMediaSafetyBody, UpdateMediaSafetyParams } from "@workspace/api-zod";

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

// GET /media
router.get("/media", async (req, res): Promise<void> => {
  const userId = optionalAuth(req);

  // Guest mode: no session, serve safe content from the specified admin's library
  if (!userId) {
    const guestAdminId = Number(req.query.guestAdminId);
    if (!guestAdminId || isNaN(guestAdminId)) {
      res.json([]);
      return;
    }
    const safeMedia = await db
      .select()
      .from(mediaTable)
      .where(and(eq(mediaTable.userId, guestAdminId), eq(mediaTable.safetyStatus, "safe")))
      .orderBy(desc(mediaTable.lastWatched), desc(mediaTable.createdAt))
      .limit(50);
    const result = await Promise.all(
      safeMedia.map(async (m) => {
        const frames = await db.select().from(jumpFramesTable).where(eq(jumpFramesTable.mediaId, m.id));
        return { ...m, jumpFrameCount: frames.length, lastWatched: m.lastWatched?.toISOString() ?? null, createdAt: m.createdAt.toISOString() };
      })
    );
    res.json(result);
    return;
  }

  const mediaList = await db
    .select()
    .from(mediaTable)
    .where(eq(mediaTable.userId, userId))
    .orderBy(desc(mediaTable.lastWatched), desc(mediaTable.createdAt))
    .limit(50);

  // Get jump frame counts
  const result = await Promise.all(
    mediaList.map(async (m) => {
      const frames = await db
        .select()
        .from(jumpFramesTable)
        .where(eq(jumpFramesTable.mediaId, m.id));
      return {
        ...m,
        jumpFrameCount: frames.length,
        lastWatched: m.lastWatched?.toISOString() ?? null,
        createdAt: m.createdAt.toISOString(),
      };
    })
  );

  res.json(result);
});

// POST /media
router.post("/media", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const parsed = CreateMediaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { type, title, fileName, fileHash, url, mimeType } = parsed.data;

  // Collapse duplicates: if this user already has a media entry with the same
  // fileHash, return the existing record instead of creating a new one.
  if (fileHash) {
    const [existing] = await db
      .select()
      .from(mediaTable)
      .where(and(eq(mediaTable.userId, userId), eq(mediaTable.fileHash, fileHash)))
      .limit(1);
    if (existing) {
      await db.update(mediaTable).set({ lastWatched: new Date() }).where(eq(mediaTable.id, existing.id));
      const frames = await db.select().from(jumpFramesTable).where(eq(jumpFramesTable.mediaId, existing.id));
      res.json({ ...existing, jumpFrameCount: frames.length, lastWatched: new Date().toISOString(), createdAt: existing.createdAt.toISOString() });
      return;
    }
  }

  // Check if matching entry already exists in global db
  let safetyStatus: "safe" | "unpreviewed" | "flagged" = "unpreviewed";
  if (fileHash || title) {
    const conditions = [];
    if (fileHash) conditions.push(eq(mediaTable.fileHash, fileHash));
    if (title) conditions.push(eq(mediaTable.title, title));
    const existing = await db
      .select()
      .from(mediaTable)
      .where(or(...conditions))
      .limit(1);
    if (existing.length > 0 && existing[0].safetyStatus === "safe") {
      safetyStatus = "safe";
    }
  }

  const [media] = await db
    .insert(mediaTable)
    .values({
      userId,
      type: type as "file" | "url",
      title: title ?? (fileName ?? url ?? "Untitled"),
      fileName: fileName ?? null,
      fileHash: fileHash ?? null,
      url: url ?? null,
      mimeType: mimeType ?? null,
      safetyStatus,
    })
    .returning();

  res.status(201).json({
    ...media,
    jumpFrameCount: 0,
    lastWatched: null,
    createdAt: media.createdAt.toISOString(),
  });
});

// GET /media/:id
router.get("/media/:id", async (req, res): Promise<void> => {
  const userId = optionalAuth(req);

  const params = GetMediaParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  // Guest mode: no session — only return content that has been marked safe
  if (!userId) {
    const [media] = await db
      .select()
      .from(mediaTable)
      .where(eq(mediaTable.id, params.data.id))
      .limit(1);
    if (!media || media.safetyStatus !== "safe") {
      res.status(403).json({ error: "GUEST_RESTRICTED", message: "This content has not been approved for unrestricted viewing." });
      return;
    }
    const frames = await db
      .select()
      .from(jumpFramesTable)
      .where(and(eq(jumpFramesTable.mediaId, media.id), eq(jumpFramesTable.validated, true)))
      .orderBy(jumpFramesTable.startTime);
    const derivedSafetyStatus = frames.length > 0 ? "safe" : media.safetyStatus;
    res.json({
      media: { ...media, jumpFrameCount: frames.length, lastWatched: media.lastWatched?.toISOString() ?? null, createdAt: media.createdAt.toISOString() },
      jumpFrames: frames.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() })),
      safetyStatus: derivedSafetyStatus,
      aiFlag: null,
    });
    return;
  }

  const [media] = await db
    .select()
    .from(mediaTable)
    .where(and(eq(mediaTable.id, params.data.id), eq(mediaTable.userId, userId)))
    .limit(1);

  if (!media) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // Get jump frames strictly for this media entry only
  const frames = await db
    .select()
    .from(jumpFramesTable)
    .where(
      and(
        eq(jumpFramesTable.mediaId, media.id),
        or(
          and(eq(jumpFramesTable.source, "personal"), eq(jumpFramesTable.submittedBy, userId)),
          and(eq(jumpFramesTable.source, "global"), eq(jumpFramesTable.validated, true))
        )
      )
    )
    .orderBy(jumpFramesTable.startTime);

  // Update lastWatched
  await db
    .update(mediaTable)
    .set({ lastWatched: new Date() })
    .where(eq(mediaTable.id, media.id));

  const derivedSafetyStatus = frames.length > 0 ? "safe" : media.safetyStatus;

  const jumpFrameList = frames.map((f) => ({
    ...f,
    createdAt: f.createdAt.toISOString(),
  }));

  res.json({
    media: {
      ...media,
      jumpFrameCount: frames.length,
      lastWatched: media.lastWatched?.toISOString() ?? null,
      createdAt: media.createdAt.toISOString(),
    },
    jumpFrames: jumpFrameList,
    safetyStatus: derivedSafetyStatus,
    aiFlag: null,
  });
});

// PATCH /media/:id/safety — admin only
router.patch("/media/:id/safety", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const [caller] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!caller || caller.role !== "admin") {
    res.status(403).json({ error: "Admin only" });
    return;
  }

  const params = UpdateMediaSafetyParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const parsed = UpdateMediaSafetyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const [media] = await db
    .select()
    .from(mediaTable)
    .where(and(eq(mediaTable.id, params.data.id), eq(mediaTable.userId, userId)))
    .limit(1);

  if (!media) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [updated] = await db
    .update(mediaTable)
    .set({ safetyStatus: parsed.data.safetyStatus })
    .where(eq(mediaTable.id, media.id))
    .returning();

  const frames = await db
    .select()
    .from(jumpFramesTable)
    .where(eq(jumpFramesTable.mediaId, media.id));

  res.json({
    ...updated,
    jumpFrameCount: frames.length,
    lastWatched: updated.lastWatched?.toISOString() ?? null,
    createdAt: updated.createdAt.toISOString(),
  });
});

// DELETE /media/:id
router.delete("/media/:id", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const params = DeleteMediaParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  await db
    .delete(mediaTable)
    .where(and(eq(mediaTable.id, params.data.id), eq(mediaTable.userId, userId)));
  res.status(204).send();
});

// POST /media/lookup
router.post("/media/lookup", async (req, res): Promise<void> => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const parsed = LookupMediaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { title, fileHash } = parsed.data;

  if (!title && !fileHash) {
    res.json({ found: false, safetyStatus: "unpreviewed", jumpFrameCount: 0, source: null, mediaId: null });
    return;
  }

  const conditions = [];
  if (fileHash) conditions.push(eq(mediaTable.fileHash, fileHash));
  if (title) conditions.push(eq(mediaTable.title, title));

  const [found] = await db
    .select()
    .from(mediaTable)
    .where(or(...conditions))
    .limit(1);

  if (!found) {
    res.json({ found: false, safetyStatus: "unpreviewed", jumpFrameCount: 0, source: null, mediaId: null });
    return;
  }

  const frames = await db
    .select()
    .from(jumpFramesTable)
    .where(eq(jumpFramesTable.mediaId, found.id));

  res.json({
    found: true,
    mediaId: found.id,
    safetyStatus: found.safetyStatus,
    jumpFrameCount: frames.length,
    source: found.userId === userId ? "personal" : "global",
  });
});

export default router;
