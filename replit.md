# FaceSearch

A face recognition web app — upload photos to a library, automatically detect and index faces, then search for matching faces by uploading a query photo.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `python3 artifacts/face-service/main.py` — run the Python face service (port 5001)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + TailwindCSS (dark "mission control" theme)
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Face AI: InsightFace 1.0.1 (buffalo_l model, CPU), Python 3.11
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/` — OpenAPI spec (source of truth for all API contracts)
- `lib/api-client-react/` — generated React Query hooks + Zod schemas
- `lib/db/src/schema/` — Drizzle ORM schema (`library_images`, `face_embeddings` tables)
- `artifacts/api-server/src/routes/` — Express route handlers (images, search, stats)
- `artifacts/api-server/src/lib/faceService.ts` — HTTP client to Python face service
- `artifacts/face-service/main.py` — Python InsightFace service (port 5001)
- `artifacts/face-search/src/pages/` — React pages (home = Library, search = Face Search)
- `artifacts/api-server/uploads/` — uploaded image files stored on disk

## Architecture decisions

- Face embeddings are computed by a separate Python microservice (port 5001) called over HTTP from the Node API server. This avoids the complexity of running Python inside Node.
- InsightFace runs in CPU mode only (`ctx_id=-1`) — no GPU required.
- The buffalo_l model is auto-downloaded to `~/.insightface/models/buffalo_l/` on first use.
- Face similarity search uses cosine similarity computed in Python across all stored embeddings; no vector DB required at this scale.
- Images are stored on disk at `artifacts/api-server/uploads/`, served via `/api/images/files/:filename`.

## Product

- **Library page**: Upload photos, see face count per image, view stats (total images, faces detected, embeddings stored), delete images.
- **Face Search page**: Upload a query photo, set a similarity threshold (0.0–1.0), execute search, see ranked matches with similarity score bars.

## Gotchas

- Do NOT `uv add opencv-python` — it installs the full OpenCV which needs `libxcb.so.1` unavailable on NixOS. Always use `opencv-python-headless` and install via `pip install --force-reinstall opencv-python-headless`.
- The face service takes a few seconds on first request to load the buffalo_l model into memory.
- The `Face Search Frontend` workflow is a stale duplicate — ignore it. The real frontend runs as `artifacts/face-search: web`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
