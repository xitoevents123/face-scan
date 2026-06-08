import { Router, type IRouter } from "express";
import { db, libraryImagesTable, faceEmbeddingsTable } from "@workspace/db";
import { count, sum } from "drizzle-orm";

const router: IRouter = Router();

router.get("/stats", async (_req, res): Promise<void> => {
  const [imageStats] = await db
    .select({ total: count(), totalFaces: sum(libraryImagesTable.faceCount) })
    .from(libraryImagesTable);

  const [embeddingStats] = await db
    .select({ total: count() })
    .from(faceEmbeddingsTable);

  res.json({
    totalImages: Number(imageStats?.total ?? 0),
    totalFaces: Number(imageStats?.totalFaces ?? 0),
    embeddingsStored: Number(embeddingStats?.total ?? 0),
  });
});

export default router;
