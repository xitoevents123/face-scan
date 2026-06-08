import { Router, type IRouter } from "express";
import { listAllImages } from "../lib/r2";
import { supabase } from "../lib/supabase";
import { logger } from "../lib/logger";
import { state, runIndexing, requestCancel } from "../lib/indexer";

const router: IRouter = Router();

/**
 * GET /api/r2/index/status
 * If no indexing has run this session, read real counts from the database
 * so the UI always reflects what's actually indexed.
 */
router.get("/r2/index/status", async (_req, res): Promise<void> => {
  if (state.running || state.total > 0) {
    const percent = state.total > 0 ? Math.round((state.processed / state.total) * 100) : 0;
    res.json({ ...state, percent });
    return;
  }

  try {
    const [{ count: embCount }, { count: imgCount }] = await Promise.all([
      supabase.from("face_embeddings").select("id", { count: "exact", head: true }).then(r => ({ count: r.count ?? 0 })),
      supabase.from("pcloud_images").select("id", { count: "exact", head: true }).then(r => ({ count: r.count ?? 0 })),
    ]);

    const dbProcessed = Number(imgCount);
    const dbFaces = Number(embCount);

    if (dbProcessed > 0) {
      state.total = dbProcessed;
      state.processed = dbProcessed;
      state.facesFound = dbFaces;
      state.finishedAt = state.finishedAt ?? "persisted";
    }

    const percent = dbProcessed > 0 ? 100 : 0;
    res.json({ ...state, total: dbProcessed, processed: dbProcessed, facesFound: dbFaces, percent });
  } catch (err) {
    logger.warn({ err }, "Failed to read DB counts for status");
    const percent = state.total > 0 ? Math.round((state.processed / state.total) * 100) : 0;
    res.json({ ...state, percent });
  }
});

/**
 * POST /api/r2/index
 * Manually trigger a full re-index of all R2 images.
 * Optional body: { folder: "baddas-weddings" }
 */
router.post("/r2/index", async (req, res): Promise<void> => {
  if (state.running) {
    res.status(409).json({ error: "Indexing already running", status: state });
    return;
  }

  const folder = (req.body as Record<string, string>)?.folder;

  try {
    const images = await listAllImages(folder ? `${folder}/` : undefined);
    logger.info({ count: images.length, folder }, "Manual re-index triggered");
    runIndexing(images); // fire and forget
    res.json({ started: true, total: images.length });
  } catch (err) {
    logger.error({ err }, "Failed to start indexing");
    res.status(500).json({ error: "Failed to list R2 images" });
  }
});

/**
 * DELETE /api/r2/index
 * Cancel running indexing.
 */
router.delete("/r2/index", (_req, res): void => {
  if (!state.running) {
    res.status(409).json({ error: "No indexing job running" });
    return;
  }
  requestCancel();
  res.json({ cancelling: true });
});

export default router;
