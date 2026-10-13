#!/usr/bin/env python3
"""Download the pinned upstream Sherpa runtime; never commit its binary to Git."""
from pathlib import Path
import hashlib, urllib.request
root=Path(__file__).resolve().parent.parent
path=root/'android/app/libs/sherpa-onnx-1.13.8.aar'
expected='633c24321e06b1fe79feafa03ea16cbc0f8a286641e2da3559bac91bdb13bd96'
if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest()!=expected:
    path.parent.mkdir(parents=True,exist_ok=True)
    temporary=path.with_suffix('.download')
    urllib.request.urlretrieve('https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.13.8/sherpa-onnx-1.13.8.aar',temporary)
    if hashlib.sha256(temporary.read_bytes()).hexdigest()!=expected:
        temporary.unlink();raise SystemExit('Sherpa runtime checksum mismatch')
    temporary.replace(path)
print('Pinned Sherpa runtime verified')
