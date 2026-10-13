#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/android-env.sh
python3 scripts/prepare-neural-runtime.py
npm run build
npx cap sync android
mkdir -p .toolchain
if [ ! -f .toolchain/folio-release.jks ]; then
  python3 - <<'PY'
from pathlib import Path
import secrets,os
root=Path('.toolchain').resolve()
password=secrets.token_hex(32)
(root/'keystore-password').write_text(password+'\n')
os.chmod(root/'keystore-password',0o600)
(root/'signing.properties').write_text('storeFile='+str(root/'folio-release.jks')+'\nstorePassword='+password+'\nkeyPassword='+password+'\nkeyAlias=folio\n')
os.chmod(root/'signing.properties',0o600)
PY
  "$JAVA_HOME/bin/keytool" -genkeypair -keystore .toolchain/folio-release.jks -storepass:file .toolchain/keystore-password -keypass:file .toolchain/keystore-password -alias folio -keyalg RSA -keysize 3072 -validity 3650 -dname 'CN=Folio Local, O=Folio, C=BR'
  chmod 600 .toolchain/folio-release.jks
fi
(cd android && ./gradlew --no-daemon assembleRelease)
mkdir -p release
cp android/app/build/outputs/apk/release/app-release.apk release/Folio-Android.apk
"$ANDROID_SDK_ROOT/build-tools/36.0.0/apksigner" verify --verbose release/Folio-Android.apk
