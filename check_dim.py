import sys
import os

try:
    from insightface.app import FaceAnalysis
    import numpy as np
    
    app = FaceAnalysis(name='buffalo_l', allowed_modules=['recognition'])
    # buffalo_l usually uses w600k_r50 or similar which is 512d
    # We can't easily run it without models downloaded, but let's try to see if it's in the environment
    print("InsightFace found")
except ImportError:
    print("InsightFace not found")
