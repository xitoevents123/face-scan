import { indexNewImages, state } from "./indexer";
import { logger } from "./logger";

const POLL_INTERVAL_MS = 60_000; // check every 60 seconds

let pollTimer: ReturnType<typeof setInterval> | null = null;

async function checkAndIndex() {
  if (state.running) return;
  try {
    const found = await indexNewImages();
    if (found > 0) {
      logger.info({ found }, "Auto-indexer: triggered indexing for new images");
    }
  } catch (err) {
    logger.warn({ err }, "Auto-indexer: error checking for new images");
  }
}

export function startAutoIndexer() {
  // Run immediately on startup
  checkAndIndex();

  // Then poll on interval
  pollTimer = setInterval(checkAndIndex, POLL_INTERVAL_MS);
  logger.info({ intervalMs: POLL_INTERVAL_MS }, "Auto-indexer started");
}

export function stopAutoIndexer() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
