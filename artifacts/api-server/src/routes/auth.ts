import { Router } from "express";
import bcrypt from "bcryptjs";
import { eq, count } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import {
  RegisterBody,
  LoginBody,
  VerifyPinBody,
  SetPinBody,
} from "@workspace/api-zod";

const router = Router();

function userToPublic(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    tier: user.tier,
    hasPin: !!user.pinHash,
    createdAt: user.createdAt,
  };
}

// POST /auth/register
router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { email, password, role, displayName } = parsed.data;

  // Enforce maximum of 2 administrator accounts
  if (role === "admin") {
    const [{ adminCount }] = await db
      .select({ adminCount: count() })
      .from(usersTable)
      .where(eq(usersTable.role, "admin"));
    if (adminCount >= 2) {
      res.status(403).json({
        error: "ADMIN_LIMIT_REACHED",
        message: "This device already has 2 administrator accounts. Contact the manufacturer for review.",
      });
      return;
    }
  }

  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  if (existing.length > 0) {
    res.status(400).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db
    .insert(usersTable)
    .values({ email, passwordHash, role: role as "admin" | "viewer", displayName: displayName ?? null, tier: "free" })
    .returning();

  req.session.userId = user.id;
  req.session.save((err) => {
    if (err) {
      res.status(500).json({ error: "Session error" });
      return;
    }
    res.status(201).json({ user: userToPublic(user), token: req.sessionID });
  });
});

// POST /auth/login
router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { email, password } = parsed.data;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  req.session.userId = user.id;
  req.session.save((err) => {
    if (err) {
      res.status(500).json({ error: "Session error" });
      return;
    }
    res.json({ user: userToPublic(user), token: req.sessionID });
  });
});

// POST /auth/logout
router.post("/auth/logout", (req, res): void => {
  req.session.destroy(() => {});
  res.json({ ok: true });
});

// GET /auth/me
router.get("/auth/me", async (req, res): Promise<void> => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.session.userId))
    .limit(1);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json(userToPublic(user));
});

// POST /auth/verify-pin
router.post("/auth/verify-pin", async (req, res): Promise<void> => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = VerifyPinBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.session.userId))
    .limit(1);
  if (!user || !user.pinHash) {
    res.status(401).json({ error: "No PIN set" });
    return;
  }
  const valid = await bcrypt.compare(parsed.data.pin, user.pinHash);
  if (!valid) {
    res.status(401).json({ error: "Wrong PIN" });
    return;
  }
  // Store unfiltered session token (expires in 30min)
  const unfilteredToken = `unfiltered_${Date.now()}_${user.id}`;
  req.session.unfilteredToken = unfilteredToken;
  req.session.unfilteredExpires = Date.now() + 30 * 60 * 1000;
  res.json({ valid: true, unfilteredToken });
});

// POST /auth/set-pin
router.post("/auth/set-pin", async (req, res): Promise<void> => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = SetPinBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const pinHash = await bcrypt.hash(parsed.data.pin, 10);
  await db
    .update(usersTable)
    .set({ pinHash })
    .where(eq(usersTable.id, req.session.userId));
  res.json({ ok: true });
});

export default router;
