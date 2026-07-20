import { Router } from "express";

const router = Router();

const API_BASE = "https://api.opensubtitles.com/api/v1";
const API_KEY = process.env.OPENSUBTITLES_API_KEY ?? "";
const USERNAME = process.env.OPENSUBTITLES_USERNAME ?? "";
const PASSWORD = process.env.OPENSUBTITLES_PASSWORD ?? "";

// ─── JWT token cache (valid 24h; refresh 1h before expiry) ────────────────────
let cachedToken: { token: string; expiresAt: number } | null = null;

async function buildHeaders(): Promise<Record<string, string>> {
  const base: Record<string, string> = {
    "Api-Key": API_KEY,
    "Content-Type": "application/json",
    "User-Agent": "SafePlayer v1.0",
    Accept: "application/json",
  };

  if (!USERNAME || !PASSWORD) return base;

  // Refresh token when missing or within 1h of expiry
  if (!cachedToken || cachedToken.expiresAt - Date.now() < 60 * 60 * 1000) {
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: base,
        body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const data = await res.json();
        cachedToken = {
          token: data.token as string,
          expiresAt: Date.now() + 23 * 60 * 60 * 1000, // 23h
        };
      }
    } catch {
      // Fall back to API-key-only (5 downloads/day)
    }
  }

  if (cachedToken) base["Authorization"] = `Bearer ${cachedToken.token}`;
  return base;
}

// ─── GET /subtitles/search?q=...&languages=en ─────────────────────────────────
router.get("/subtitles/search", async (req, res): Promise<void> => {
  const q = (req.query.q as string | undefined)?.trim();
  const languages = (req.query.languages as string | undefined) ?? "en";

  if (!q) {
    res.status(400).json({ error: "Query (q) is required" });
    return;
  }
  if (!API_KEY) {
    res.status(503).json({ error: "OpenSubtitles API key not configured" });
    return;
  }

  try {
    const headers = await buildHeaders();
    const params = new URLSearchParams({ query: q, languages });
    const upstream = await fetch(`${API_BASE}/subtitles?${params}`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });

    if (!upstream.ok) {
      const body = await upstream.text();
      req.log.warn({ status: upstream.status, body }, "OpenSubtitles search failed");
      res.status(502).json({ error: `OpenSubtitles returned ${upstream.status}` });
      return;
    }

    const data = await upstream.json();

    // Normalize to a flat, frontend-friendly shape
    const results = (data.data ?? [])
      .slice(0, 25)
      .map((item: any) => {
        const file = item.attributes?.files?.[0];
        return {
          id: item.id as string,
          fileId: file?.file_id as number | undefined,
          fileName: (file?.file_name as string | undefined) ?? "subtitle",
          language: (item.attributes?.language as string | undefined) ?? "unknown",
          releaseName: (item.attributes?.release as string | undefined) ?? "",
          movieName:
            (item.attributes?.feature_details?.movie_name as string | undefined) ??
            (item.attributes?.feature_details?.title as string | undefined) ??
            "",
          downloadCount: (item.attributes?.download_count as number | undefined) ?? 0,
          format: (item.attributes?.format as string | undefined) ?? "srt",
          rating: item.attributes?.ratings as number | undefined,
        };
      })
      .filter((r: any) => r.fileId != null);

    res.json({ results });
  } catch (err) {
    req.log.warn({ err }, "subtitle search failed");
    res.status(502).json({ error: "Failed to search subtitles" });
  }
});

// ─── POST /subtitles/download  body: { fileId: number } ──────────────────────
router.post("/subtitles/download", async (req, res): Promise<void> => {
  const { fileId } = req.body as { fileId?: number };

  if (!fileId) {
    res.status(400).json({ error: "fileId is required" });
    return;
  }
  if (!API_KEY) {
    res.status(503).json({ error: "OpenSubtitles API key not configured" });
    return;
  }

  try {
    const headers = await buildHeaders();

    // Step 1 – obtain the short-lived download link
    const linkRes = await fetch(`${API_BASE}/download`, {
      method: "POST",
      headers,
      body: JSON.stringify({ file_id: fileId }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!linkRes.ok) {
      const body = await linkRes.text();
      req.log.warn({ status: linkRes.status, body }, "OpenSubtitles download request failed");
      res.status(502).json({ error: `OpenSubtitles returned ${linkRes.status}` });
      return;
    }

    const { link, file_name } = (await linkRes.json()) as { link?: string; file_name?: string };
    if (!link) {
      res.status(502).json({ error: "No download link returned by OpenSubtitles" });
      return;
    }

    // Step 2 – stream the subtitle file content back to the client
    const fileRes = await fetch(link, {
      headers: { "User-Agent": "SafePlayer/1.0" },
      signal: AbortSignal.timeout(20_000),
    });

    if (!fileRes.ok) {
      res.status(502).json({ error: `Subtitle file fetch failed: ${fileRes.status}` });
      return;
    }

    const content = await fileRes.text();
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("X-Subtitle-FileName", file_name ?? "subtitle.srt");
    res.send(content);
  } catch (err) {
    req.log.warn({ err }, "subtitle download failed");
    res.status(502).json({ error: "Failed to download subtitle" });
  }
});

// ─── GET /subtitles/proxy?url=<encoded> ──────────────────────────────────────
/**
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
