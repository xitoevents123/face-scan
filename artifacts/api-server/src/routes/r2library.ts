import { Router, type IRouter } from "express";
import { listAllImages } from "../lib/r2";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * GET /api/r2/images
 * List all images from Cloudflare R2 bucket.
 * Optional query param: ?folder=baddas-weddings
 */
router.get("/r2/images", async (req, res): Promise<void> => {
  const folder = req.query.folder as string | undefined;
  const prefix = folder ? `${folder}/` : undefined;

  try {
    const images = await listAllImages(prefix);
    res.json(images);
  } catch (err) {
    logger.error({ err }, "Failed to list R2 images");
    res.status(500).json({ error: "Failed to list images from R2" });
  }
});

/**
 * GET /api/r2/folders
 * List unique top-level folders in the R2 bucket.
 */
router.get("/r2/folders", async (_req, res): Promise<void> => {
  try {
    const images = await listAllImages();
    const folders = [...new Set(images.map(img => img.folder).filter(Boolean))];
    res.json(folders.sort());
  } catch (err) {
    logger.error({ err }, "Failed to list R2 folders");
    res.status(500).json({ error: "Failed to list folders from R2" });
  }
});

/**
 * GET /api/r2/stats
 * Count of images and folders in R2.
 */
router.get("/r2/stats", async (_req, res): Promise<void> => {
  try {
    const images = await listAllImages();
    const folders = [...new Set(images.map(img => img.folder).filter(Boolean))];
    res.json({
      totalImages: images.length,
      totalFolders: folders.length,
      folders,
    });
  } catch (err) {
    logger.error({ err }, "Failed to get R2 stats");
    res.status(500).json({ error: "Failed to get R2 stats" });
  }
});

export default router;
