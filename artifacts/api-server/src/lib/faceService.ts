import { logger } from "./logger";

const FACE_SERVICE_URL = (
  process.env.FACE_SERVICE_URL ??
  `http://localhost:${process.env.FACE_SERVICE_PORT ?? "5001"}`
).replace(/\/$/, "");

export interface EmbedResult {
  error: string | null;
  embeddings: number[][];
  face_count: number;
}

export interface SearchMatch {
  id: number;
  image_id: number;
  score: number;
}

export interface SearchResult {
  matches: SearchMatch[];
}

/**
 * Extract face embeddings from an image buffer.
 * @param mode "search" = 640×640 det grid, accurate (for query images)
 *             "index"  = 320×320 det grid, fast (for bulk indexing)
 */
export async function extractEmbeddings(
  imageBuffer: Buffer,
  mimeType: string,
  mode: "search" | "index" = "index"
): Promise<EmbedResult> {
  const formData = new FormData();
  const blob = new Blob([imageBuffer], { type: mimeType });
  formData.append("file", blob, "image.jpg");
  formData.append("mode", mode);

  const response = await fetch(`${FACE_SERVICE_URL}/embed`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    logger.warn({ status: response.status, body: text }, "Face service embed error");
    return { error: text, embeddings: [], face_count: 0 };
  }

  return response.json() as Promise<EmbedResult>;
}

export async function searchFaces(
  queryEmbedding: number[],
  candidates: Array<{ id: number; image_id: number; embedding: number[] }>,
  threshold = 0.40
): Promise<SearchResult> {
  const response = await fetch(`${FACE_SERVICE_URL}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query_embedding: queryEmbedding, candidates, threshold }),
  });

  if (!response.ok) {
    const text = await response.text();
    logger.warn({ status: response.status, body: text }, "Face service search error");
    return { matches: [] };
  }

  return response.json() as Promise<SearchResult>;
}

export async function checkFaceService(): Promise<boolean> {
  try {
    const response = await fetch(`${FACE_SERVICE_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}
