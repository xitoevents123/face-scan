import { Router, type IRouter } from "express";
import { supabase } from "../lib/supabase";
import { logger } from "../lib/logger";

const router: IRouter = Router();

export interface PCloudImage {
  id: string;
  pcloud_file_id: string;
  pcloud_url: string;
  original_name: string | null;
  user_id: string | null;
  face_count: number;
  created_at: string;
}

/**
 * GET /api/library
 * Returns all pCloud images stored in Supabase.
 * Optional query param: ?user_id=xxx to filter by user
 */
router.get("/library", async (req, res): Promise<void> => {
  const userId = req.query.user_id as string | undefined;

  let query = supabase
    .from("pcloud_images")
    .select("*")
    .order("created_at", { ascending: false });

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;

  if (error) {
    logger.error({ error }, "Supabase library query failed");
    res.status(500).json({ error: "Failed to load library: " + error.message });
    return;
  }

  res.json(data ?? []);
});

/**
 * GET /api/library/stats
 * Returns counts from Supabase (pcloud_images + face_embeddings).
 */
router.get("/library/stats", async (_req, res): Promise<void> => {
  const [imagesResult, embResult, faceData] = await Promise.all([
    supabase.from("pcloud_images").select("*", { count: "exact", head: true }),
    supabase.from("face_embeddings").select("*", { count: "exact", head: true }),
    supabase.from("pcloud_images").select("face_count"),
  ]);

  const totalFaces = ((faceData.data ?? []) as { face_count: number }[])
    .reduce((sum, r) => sum + (r.face_count || 0), 0);

  res.json({
    totalImages: imagesResult.count ?? 0,
    totalFaces,
    embeddingsStored: embResult.count ?? 0,
  });
});

export default router;
