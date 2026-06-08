import { listAllImages, r2, bucketName, publicUrl, type R2Image } from "./r2";
import { supabase } from "./supabase";
import { extractEmbeddings } from "./faceService";
import { logger } from "./logger";
import { GetObjectCommand } from "@aws-sdk/client-s3";

export interface IndexState {
  running: boolean;
  total: number;
  processed: number;
  skipped: number;
  failed: number;
  facesFound: number;
  startedAt: string | null;
  finishedAt: string | null;
  currentFile: string | null;
  errors: string[];
  autoIndexed: number;
}

export const state: IndexState = {
  running: false,
  total: 0,
  processed: 0,
  skipped: 0,
  failed: 0,
  facesFound: 0,
  startedAt: null,
  finishedAt: null,
  currentFile: null,
  errors: [],
  autoIndexed: 0,
};

export let cancelRequested = false;

export function requestCancel() {
  cancelRequested = true;
}

async function downloadR2Image(key: string): Promise<Buffer> {
  const cmd = new GetObjectCommand({ Bucket: bucketName!, Key: key });
  const res = await r2.send(cmd);
  const chunks: Uint8Array[] = [];
  for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function getExtMime(key: string): string {
  const ext = key.slice(key.lastIndexOf(".")).toLowerCase();
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".avif": "image/avif",
  };
  return map[ext] ?? "image/jpeg";
}

export async function runIndexing(images: R2Image[]) {
  state.running = true;
  state.total = images.length;
  state.processed = 0;
  state.skipped = 0;
  state.failed = 0;
  state.facesFound = 0;
  state.startedAt = new Date().toISOString();
  state.finishedAt = null;
  state.currentFile = null;
  state.errors = [];
  cancelRequested = false;

  const { data: noFaceImages } = await supabase
    .from("pcloud_images")
    .select("pcloud_file_id")
    .eq("face_count", 0);
  const noFaceKeys = new Set((noFaceImages ?? []).map((r: { pcloud_file_id: string }) => r.pcloud_file_id));

  const { data: embeddedImages } = await supabase
    .from("face_embeddings")
    .select("image_id");
  const embeddedKeys = new Set((embeddedImages ?? []).map((r: { image_id: string }) => r.image_id));

  const CONCURRENCY = 3;

  for (let i = 0; i < images.length; i += CONCURRENCY) {
    if (cancelRequested) break;

    const batch = images.slice(i, i + CONCURRENCY);

    await Promise.all(batch.map(async (img) => {
      if (cancelRequested) return;
      if (noFaceKeys.has(img.key) || embeddedKeys.has(img.key)) {
        state.skipped++;
        state.processed++;
        return;
      }

      state.currentFile = img.filename;

      try {
        const buffer = await downloadR2Image(img.key);
        const mime = getExtMime(img.key);
        const embedResult = await extractEmbeddings(buffer, mime);
        const faceCount = embedResult.face_count;

        await supabase.from("pcloud_images").upsert(
          {
            pcloud_file_id: img.key,
            pcloud_url: `${publicUrl}/${img.key}`,
            original_name: img.filename,
            face_count: faceCount,
          },
          { onConflict: "pcloud_file_id" }
        );

        if (faceCount > 0) {
          const rows = embedResult.embeddings.map((embedding) => ({
            image_id: img.key,
            embedding,
          }));
          await supabase.from("face_embeddings").insert(rows);
          state.facesFound += faceCount;
          embeddedKeys.add(img.key);
        } else {
          noFaceKeys.add(img.key);
        }

        state.processed++;
      } catch (err) {
        state.failed++;
        state.processed++;
        const msg = `${img.key}: ${err instanceof Error ? err.message : String(err)}`;
        if (state.errors.length < 20) state.errors.push(msg);
        logger.warn({ key: img.key, err }, "Failed to index image");
      }
    }));
  }

  state.running = false;
  state.finishedAt = new Date().toISOString();
  state.currentFile = null;
  logger.info({ processed: state.processed, faces: state.facesFound }, "Indexing finished");
}

/**
 * Finds images in R2 that are NOT yet indexed and indexes only those.
 * Returns the count of new images found.
 */
export async function indexNewImages(folder?: string): Promise<number> {
  if (state.running) return 0;

  const allImages = await listAllImages(folder ? `${folder}/` : undefined);

  const { data: noFaceImages } = await supabase
    .from("pcloud_images")
    .select("pcloud_file_id")
    .eq("face_count", 0);
  const noFaceKeys = new Set((noFaceImages ?? []).map((r: { pcloud_file_id: string }) => r.pcloud_file_id));

  const { data: embeddedImages } = await supabase
    .from("face_embeddings")
    .select("image_id");
  const embeddedKeys = new Set((embeddedImages ?? []).map((r: { image_id: string }) => r.image_id));

  const newImages = allImages.filter(
    (img) => !noFaceKeys.has(img.key) && !embeddedKeys.has(img.key)
  );

  if (newImages.length === 0) return 0;

  logger.info({ count: newImages.length }, "Auto-indexer: found new unindexed images, starting");
  state.autoIndexed += newImages.length;

  runIndexing(newImages); // fire and forget
  return newImages.length;
}
