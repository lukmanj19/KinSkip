import { Router } from "express";

const router = Router();

/**
 * GET /subtitles/proxy?url=<encoded>
 * Server-side proxy that fetches subtitle files to bypass browser CORS restrictions.
 * Returns the raw subtitle text (SRT or VTT) for the client to process.
 */
router.get("/subtitles/proxy", async (req, res): Promise<void> => {
  const url = req.query.url as string | undefined;
  if (!url || !url.startsWith("http")) {
    res.status(400).json({ error: "A valid http(s) URL is required" });
    return;
  }

  try {
    const upstream = await fetch(url, {
      headers: { "User-Agent": "SafePlayer/1.0 subtitle-proxy" },
      signal: AbortSignal.timeout(10_000),
    });

    if (!upstream.ok) {
      res.status(502).json({ error: `Upstream returned ${upstream.status}` });
      return;
    }

    const text = await upstream.text();
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send(text);
  } catch (err) {
    req.log.warn({ err, url }, "subtitle proxy fetch failed");
    res.status(502).json({ error: "Failed to fetch subtitle from upstream" });
  }
});

export default router;
