-- ============================================================
-- Run this ONCE in your Supabase SQL Editor
-- Dashboard → SQL Editor → New query → paste → Run
-- ============================================================

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add a native vector column (512 dims = InsightFace buffalo_l)
ALTER TABLE face_embeddings
  ADD COLUMN IF NOT EXISTS embedding_vec vector(512);

-- 3. Backfill existing rows from the jsonb column
--    jsonb arrays like [0.1, 0.2, ...] cast cleanly to vector
UPDATE face_embeddings
SET embedding_vec = embedding::text::vector
WHERE embedding_vec IS NULL
  AND jsonb_typeof(embedding) = 'array';

-- 4. HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS face_embeddings_vec_idx
  ON face_embeddings
  USING hnsw (embedding_vec vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 5. Trigger: auto-populate embedding_vec on every INSERT/UPDATE
CREATE OR REPLACE FUNCTION sync_embedding_vec()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.embedding IS NOT NULL THEN
    NEW.embedding_vec := NEW.embedding::text::vector;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_embedding_vec_trigger ON face_embeddings;
CREATE TRIGGER sync_embedding_vec_trigger
  BEFORE INSERT OR UPDATE OF embedding ON face_embeddings
  FOR EACH ROW EXECUTE FUNCTION sync_embedding_vec();

-- 6. RPC function used by the API for vector similarity search
CREATE OR REPLACE FUNCTION match_faces(
  query_embedding vector(512),
  match_threshold  float,
  match_count      int
)
RETURNS TABLE (
  id        bigint,
  image_id  text,
  score     float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    id,
    image_id,
    (1 - (embedding_vec <=> query_embedding))::float AS score
  FROM face_embeddings
  WHERE embedding_vec IS NOT NULL
    AND (1 - (embedding_vec <=> query_embedding)) >= match_threshold
  ORDER BY embedding_vec <=> query_embedding
  LIMIT match_count;
$$;
