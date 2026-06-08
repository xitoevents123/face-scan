import { Router, type IRouter } from "express";
import multer from "multer";
import { extractEmbeddings } from "../lib/faceService";
import { supabase, cosineSimilarity, type FaceEmbeddingRow } from "../lib/supabase";
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

const BATCH_SIZE = 5000;

async function fetchAllEmbeddings(): Promise<FaceEmbeddingRow[]> {
  const all: FaceEmbeddingRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("face_embeddings")
      .select("id, image_id, embedding")
      .range(from, from + BATCH_SIZE - 1);

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    all.push(...(data as FaceEmbeddingRow[]));
    if (data.length < BATCH_SIZE) break;
    from += BATCH_SIZE;
  }

  return all;
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

  let allRows: FaceEmbeddingRow[];
  try {
    allRows = await fetchAllEmbeddings();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "Supabase select failed");
    res.status(500).json({ error: "Failed to load embeddings: " + msg });
    return;
  }

  const scored = allRows
    .map((row) => ({
      embedding_id: row.id,
      image_key: row.image_id,
      score: cosineSimilarity(queryEmbedding, row.embedding),
    }))
    .filter((r) => r.score >= effectiveThreshold);

  const bestByImage = new Map<string, typeof scored[0]>();
  for (const match of scored) {
    const existing = bestByImage.get(match.image_key);
    if (!existing || match.score > existing.score) {
      bestByImage.set(match.image_key, match);
    }
  }

  const matches = Array.from(bestByImage.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 100)
    .map((m) => {
      const filename = m.image_key.split("/").pop() ?? m.image_key;
      return {
        image_key: m.image_key,
        url: `${publicUrl}/${m.image_key}`,
        filename,
        score: Math.round(m.score * 1000) / 1000,
        embedding_id: m.embedding_id,
      };
    });

  logger.info({ queryFaces: embedResult.face_count, totalSearched: allRows.length, matched: matches.length }, "Search completed");

  res.json({
    matches,
    query_faces_found: embedResult.face_count,
    total_searched: allRows.length,
  });
});

export default router;
