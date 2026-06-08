import { Router, type IRouter } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db, libraryImagesTable, faceEmbeddingsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { extractEmbeddings } from "../lib/faceService";
import { logger } from "../lib/logger";

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

const uploadsDir = path.resolve(workspaceRoot, "artifacts/api-server/uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
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

function imageUrl(filename: string): string {
  return `/api/images/files/${filename}`;
}

function formatImage(img: typeof libraryImagesTable.$inferSelect) {
  return {
    id: img.id,
    filename: img.filename,
    originalName: img.originalName,
    faceCount: img.faceCount,
    uploadedAt: img.uploadedAt.toISOString(),
    url: imageUrl(img.filename),
  };
}

// Serve uploaded files
router.get("/images/files/:filename", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;
  // Only allow simple filenames, no path traversal
  if (!raw || /[/\\]/.test(raw)) {
    res.status(400).json({ error: "Invalid filename" });
    return;
  }
  const filePath = path.join(uploadsDir, raw);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "File not found" });
    return;
  }
  res.sendFile(filePath);
});

// List all images
router.get("/images", async (req, res): Promise<void> => {
  const images = await db
    .select()
    .from(libraryImagesTable)
    .orderBy(desc(libraryImagesTable.uploadedAt));
  res.json(images.map(formatImage));
});

// Get single image
router.get("/images/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [img] = await db.select().from(libraryImagesTable).where(eq(libraryImagesTable.id, id));
  if (!img) {
    res.status(404).json({ error: "Image not found" });
    return;
  }
  res.json(formatImage(img));
});

// Upload single image (internal helper)
async function processUpload(req: import("express").Request, file: Express.Multer.File): Promise<ReturnType<typeof formatImage>> {
  const fileBuffer = fs.readFileSync(file.path);
  const embedResult = await extractEmbeddings(fileBuffer, file.mimetype);

  // Only reject if the image itself couldn't be decoded (not a face-service availability issue)
  if (embedResult.error === "Could not decode image") {
    fs.unlinkSync(file.path);
    throw Object.assign(new Error("Could not decode image"), { statusCode: 400 });
  }

  const faceCount = embedResult.face_count;

  const [image] = await db
    .insert(libraryImagesTable)
    .values({
      filename: file.filename,
      originalName: file.originalname,
      faceCount,
    })
    .returning();

  if (embedResult.embeddings.length > 0) {
    await Promise.all(
      embedResult.embeddings.map((emb) =>
        db.insert(faceEmbeddingsTable).values({
          imageId: image.id,
          embedding: emb,
        })
      )
    );
  }

  req.log.info({ imageId: image.id, faceCount }, "Image uploaded and processed");
  return formatImage(image);
}

// Upload single image
router.post("/images/upload", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  try {
    const result = await processUpload(req, req.file);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(err.statusCode ?? 500).json({ error: err.message ?? "Upload failed" });
  }
});

// Upload multiple images
router.post("/images/upload-many", upload.array("files", 50), async (req, res): Promise<void> => {
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) {
    res.status(400).json({ error: "No files uploaded" });
    return;
  }
  const results = await Promise.allSettled(files.map((f) => processUpload(req, f)));
  const succeeded = results
    .filter((r): r is PromiseFulfilledResult<ReturnType<typeof formatImage>> => r.status === "fulfilled")
    .map((r) => r.value);
  const failed = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => r.reason?.message ?? "Unknown error");
  res.status(201).json({ uploaded: succeeded, errors: failed });
});

// Delete image
router.delete("/images/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [img] = await db
    .delete(libraryImagesTable)
    .where(eq(libraryImagesTable.id, id))
    .returning();

  if (!img) {
    res.status(404).json({ error: "Image not found" });
    return;
  }

  // Delete file from disk
  const filePath = path.join(uploadsDir, img.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  res.sendStatus(204);
});

export default router;
