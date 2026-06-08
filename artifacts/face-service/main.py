"""
Face recognition service using InsightFace.
Two modes:
  - index (default): 320px det grid, max 1024px — fast for bulk processing
  - search: 640px det grid, max 2048px — accurate for query images
"""
import os
import sys
import json
import numpy as np
import io
import time

try:
    import cv2
    from insightface.app import FaceAnalysis
    INSIGHTFACE_AVAILABLE = True
except ImportError:
    INSIGHTFACE_AVAILABLE = False
    print("InsightFace not available. Install with: pip install insightface opencv-python-headless", file=sys.stderr)

try:
    from flask import Flask, request, jsonify
    FLASK_AVAILABLE = True
except ImportError:
    FLASK_AVAILABLE = False

# Two face app instances: fast (indexing) and accurate (search)
FACE_APP_FAST = None      # 320×320 det grid — for bulk indexing
FACE_APP_ACCURATE = None  # 640×640 det grid — for search queries

MAX_DIM_FAST = 1024
MAX_DIM_ACCURATE = 2048


def get_face_app(mode="index"):
    global FACE_APP_FAST, FACE_APP_ACCURATE
    if not INSIGHTFACE_AVAILABLE:
        return None

    if mode == "search":
        if FACE_APP_ACCURATE is None:
            t0 = time.perf_counter()
            FACE_APP_ACCURATE = FaceAnalysis(
                name="buffalo_l",
                allowed_modules=["detection", "recognition"],
                providers=["CPUExecutionProvider"],
            )
            FACE_APP_ACCURATE.prepare(ctx_id=-1, det_size=(640, 640))
            elapsed = (time.perf_counter() - t0) * 1000
            print(f"Accurate model loaded in {elapsed:.0f}ms (det_size=640, max_dim={MAX_DIM_ACCURATE})", flush=True)
        return FACE_APP_ACCURATE
    else:
        if FACE_APP_FAST is None:
            t0 = time.perf_counter()
            FACE_APP_FAST = FaceAnalysis(
                name="buffalo_l",
                allowed_modules=["detection", "recognition"],
                providers=["CPUExecutionProvider"],
            )
            FACE_APP_FAST.prepare(ctx_id=-1, det_size=(320, 320))
            elapsed = (time.perf_counter() - t0) * 1000
            print(f"Fast model loaded in {elapsed:.0f}ms (det_size=320, max_dim={MAX_DIM_FAST})", flush=True)
        return FACE_APP_FAST


def decode_and_resize(image_bytes, max_dim):
    """Decode image bytes and downscale if larger than max_dim on either axis."""
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return None
    h, w = img.shape[:2]
    if max(h, w) > max_dim:
        scale = max_dim / max(h, w)
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    return img


def cosine_similarity(a, b):
    a = np.array(a)
    b = np.array(b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def extract_embeddings_from_bytes(image_bytes, mode="index"):
    if not INSIGHTFACE_AVAILABLE:
        return {"error": "InsightFace not installed", "embeddings": [], "face_count": 0}
    app = get_face_app(mode)
    if app is None:
        return {"error": "Failed to initialize face model", "embeddings": [], "face_count": 0}

    max_dim = MAX_DIM_ACCURATE if mode == "search" else MAX_DIM_FAST
    img = decode_and_resize(image_bytes, max_dim)
    if img is None:
        return {"error": "Could not decode image", "embeddings": [], "face_count": 0}

    faces = app.get(img)
    if not faces:
        return {"error": None, "embeddings": [], "face_count": 0}

    embeddings = [face.embedding.tolist() for face in faces]
    return {"error": None, "embeddings": embeddings, "face_count": len(embeddings)}


def create_flask_app():
    app = Flask(__name__)

    @app.after_request
    def add_cors_headers(response):
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        return response

    @app.route("/", defaults={"path": ""}, methods=["OPTIONS"])
    @app.route("/<path:path>", methods=["OPTIONS"])
    def handle_options(path):
        from flask import Response
        resp = Response(status=204)
        resp.headers["Access-Control-Allow-Origin"] = "*"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        return resp

    @app.route("/health")
    def health():
        return jsonify({
            "status": "ok",
            "insightface": INSIGHTFACE_AVAILABLE,
            "fast_model_loaded": FACE_APP_FAST is not None,
            "accurate_model_loaded": FACE_APP_ACCURATE is not None,
        })

    @app.route("/embed", methods=["POST"])
    def embed():
        if "file" not in request.files:
            return jsonify({"error": "No file field"}), 400
        file_bytes = request.files["file"].read()
        # mode: "search" (640×640, accurate) or "index" (320×320, fast)
        mode = request.form.get("mode", "index")
        result = extract_embeddings_from_bytes(file_bytes, mode)
        if result["error"] and result["face_count"] == 0:
            return jsonify({"error": result["error"]}), 400
        return jsonify(result)

    @app.route("/search", methods=["POST"])
    def search():
        data = request.get_json(force=True)
        query_embedding = data["query_embedding"]
        candidates = data["candidates"]
        threshold = data.get("threshold", 0.40)

        qvec = np.array(query_embedding)
        qnorm = np.linalg.norm(qvec)

        results = []
        if qnorm > 0:
            for candidate in candidates:
                cvec = np.array(candidate["embedding"])
                cnorm = np.linalg.norm(cvec)
                if cnorm > 0:
                    score = float(np.dot(qvec, cvec) / (qnorm * cnorm))
                    if score >= threshold:
                        results.append({
                            "id": candidate["id"],
                            "image_id": candidate["image_id"],
                            "score": score,
                        })

        results.sort(key=lambda x: x["score"], reverse=True)
        return jsonify({"matches": results})

    @app.route("/compare", methods=["POST"])
    def compare():
        data = request.get_json(force=True)
        score = cosine_similarity(data["embedding_a"], data["embedding_b"])
        return jsonify({"score": score})

    return app


def main():
    port = int(os.environ.get("FACE_SERVICE_PORT", 5001))

    if not FLASK_AVAILABLE:
        print("Flask not available — install with: pip install flask", file=sys.stderr)
        sys.exit(1)

    # Pre-warm the fast model at startup so the first indexing request is fast
    print("Pre-loading face models...", flush=True)
    get_face_app("index")

    print(f"Face service running on port {port} (Flask)", flush=True)
    app = create_flask_app()
    app.run(host="0.0.0.0", port=port, threaded=True)


if __name__ == "__main__":
    main()
