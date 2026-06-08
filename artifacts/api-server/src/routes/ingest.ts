import { Router, type IRouter } from "express";
import multer from "multer";
import { extractEmbeddings } from "../lib/faceService";
import { supabase } from "../lib/supabase";
import { logger } from "../lib/logger";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

const router: IRouter = Router();

/**
 * POST /api/ingest
 * Called by your React app right after uploading a photo to pCloud.
 *
 * Form fields:
 *   file            — the image file (multipart)
 *   pcloud_file_id  — the pCloud file ID returned after upload (string)
 *   pcloud_url      — direct download/view URL for the image on pCloud
 *   user_id         — the user who owns this photo (string, optional)
 *   original_name   — original filename (string, optional)
 *
 * Returns:
 *   { success, faces_found, embedding_ids: string[] }
 */
router.post("/ingest", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const body = req.body as Record<string, string>;
  const pcloudFileId = body.pcloud_file_id;
  const pcloudUrl = body.pcloud_url ?? "";
  const userId = body.user_id ?? null;
  const originalName = body.original_name ?? req.file.originalname ?? null;

  if (!pcloudFileId) {
    res.status(400).json({ error: "pcloud_file_id is required" });
    return;
  }

  const embedResult = await extractEmbeddings(req.file.buffer, req.file.mimetype);

  if (embedResult.error === "Could not decode image") {
    res.status(400).json({ error: "Could not decode image" });
    return;
  }

  const faceCount = embedResult.face_count;

  // Upsert into pcloud_images so the library page can display it
  await supabase.from("pcloud_images").upsert(
    {
      pcloud_file_id: pcloudFileId,
      pcloud_url: pcloudUrl,
      original_name: originalName,
      user_id: userId,
      face_count: faceCount,
    },
    { onConflict: "pcloud_file_id" }
  );

  if (faceCount === 0) {
    res.status(200).json({
      success: true,
      faces_found: 0,
      embedding_ids: [],
      message: "No faces detected in this image",
    });
    return;
  }

  const rows = embedResult.embeddings.map((embedding) => ({
    image_id: pcloudFileId,
    user_id: userId,
    embedding,
  }));

  const { data, error } = await supabase
    .from("face_embeddings")
    .insert(rows)
    .select("id");

  if (error) {
    logger.error({ error }, "Supabase insert failed");
    res.status(500).json({ error: "Failed to save embeddings: " + error.message });
    return;
  }

  logger.info({ pcloudFileId, userId, faces: faceCount }, "Ingested image");

  res.status(201).json({
    success: true,
    faces_found: faceCount,
    embedding_ids: (data ?? []).map((r: { id: string }) => r.id),
  });
});

export default router;
