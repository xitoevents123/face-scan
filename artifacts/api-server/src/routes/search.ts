import { Router, type IRouter } from "express";
import multer from "multer";
import { extractEmbeddings } from "../lib/faceService";
import { qdrant, COLLECTION_NAME, ensureCollection } from "../lib/qdrant";
import { publicUrl } from "../lib/r2";
import { logger } from "../lib/logger";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

interface VectorMatch {
  id: string | number;
  image_id: string;
  score: number;
}

async function searchByVector(
  queryEmbedding: number[],
  threshold: number,
  matchCount: number
): Promise<VectorMatch[]> {
  await ensureCollection();
  const results = await qdrant.search(COLLECTION_NAME, {
    vector: queryEmbedding,
    limit: matchCount,
    score_threshold: threshold,
    with_payload: true,
  });
  return results.map((r) => ({
    id: r.id,
    image_id: (r.payload as { image_id?: string })?.image_id ?? "",
    score: r.score,
  }));
}

const router: IRouter = Router();

router.post("/search", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const body = req.body as Record<string, string>;
  const threshold = parseFloat(body.threshold ?? "0.40");
  const effectiveThreshold = isNaN(threshold) ? 0.40 : threshold;

  const embedResult = await extractEmbeddings(req.file.buffer, req.file.mimetype, "search");

  if (embedResult.face_count === 0) {
    res.status(400).json({ error: "No faces detected in the query image" });
    return;
  }

  const queryEmbedding = embedResult.embeddings[0];

  let rawMatches: VectorMatch[];
  try {
    rawMatches = await searchByVector(queryEmbedding, effectiveThreshold, 10000);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "Qdrant search failed");
    res.status(500).json({ error: "Search failed: " + msg });
    return;
  }

  const bestByImage = new Map<string, VectorMatch>();
  for (const match of rawMatches) {
    const existing = bestByImage.get(match.image_id);
    if (!existing || match.score > existing.score) {
      bestByImage.set(match.image_id, match);
    }
  }

  const matches = Array.from(bestByImage.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 1000)
    .map((m) => {
      const filename = m.image_id.split("/").pop() ?? m.image_id;
      return {
        image_key: m.image_id,
        url: `${publicUrl}/${m.image_id}`,
        filename,
        score: Math.round(m.score * 1000) / 1000,
        embedding_id: m.id,
      };
    });

  logger.info({ queryFaces: embedResult.face_count, candidates: rawMatches.length, matched: matches.length }, "Search completed");

  res.json({
    matches,
    query_faces_found: embedResult.face_count,
    total_searched: rawMatches.length,
  });
});

export default router;
