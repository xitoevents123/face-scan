#!/bin/sh
set -e

FACE_SERVICE_PORT=${FACE_SERVICE_PORT:-5000}

export FACE_SERVICE_PORT

python3 artifacts/face-service/main.py &
FACE_PID=$!

cleanup() {
  kill $FACE_PID 2>/dev/null || true
}
trap cleanup EXIT INT TERM

PORT=${PORT:-8080} NODE_ENV=production node --enable-source-maps artifacts/api-server/dist/index.mjs
