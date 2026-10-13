#!/usr/bin/env bash
set -euo pipefail
FOLIO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FOLIO_TOOLCHAIN="$FOLIO_ROOT/.toolchain"
mkdir -p "$FOLIO_TOOLCHAIN/downloads"

if [[ ! -x "$FOLIO_TOOLCHAIN/jdk/Contents/Home/bin/java" && ! -x "$FOLIO_TOOLCHAIN/jdk/bin/java" ]]; then
  case "$(uname -s):$(uname -m)" in
    Darwin:arm64) FOLIO_JDK_OS=mac; FOLIO_JDK_ARCH=aarch64 ;;
    Darwin:x86_64) FOLIO_JDK_OS=mac; FOLIO_JDK_ARCH=x64 ;;
    Linux:x86_64) FOLIO_JDK_OS=linux; FOLIO_JDK_ARCH=x64 ;;
    Linux:aarch64) FOLIO_JDK_OS=linux; FOLIO_JDK_ARCH=aarch64 ;;
    *) echo 'Unsupported host. Provide JDK21 and Android SDK manually.' >&2; exit 1 ;;
  esac
  curl --fail --location --retry 3 "https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=$FOLIO_JDK_ARCH&image_type=jdk&os=$FOLIO_JDK_OS" --output "$FOLIO_TOOLCHAIN/downloads/jdk-metadata.json"
  FOLIO_JDK_URL="$(node -e 'console.log(require(process.argv[1])[0].binary.package.link)' "$FOLIO_TOOLCHAIN/downloads/jdk-metadata.json")"
  FOLIO_JDK_SHA="$(node -e 'console.log(require(process.argv[1])[0].binary.package.checksum)' "$FOLIO_TOOLCHAIN/downloads/jdk-metadata.json")"
  curl --fail --location --retry 3 "$FOLIO_JDK_URL" --output "$FOLIO_TOOLCHAIN/downloads/jdk.tar.gz"
  echo "$FOLIO_JDK_SHA  $FOLIO_TOOLCHAIN/downloads/jdk.tar.gz" | shasum -a 256 --check
  mkdir -p "$FOLIO_TOOLCHAIN/jdk"
  tar -xzf "$FOLIO_TOOLCHAIN/downloads/jdk.tar.gz" -C "$FOLIO_TOOLCHAIN/jdk" --strip-components=1
fi

source "$FOLIO_ROOT/scripts/android-env.sh"
if [[ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]]; then
  case "$(uname -s):$(uname -m)" in
    Darwin:arm64) FOLIO_SDK_PACKAGE=commandlinetools-mac_arm64-15859902_latest.zip; FOLIO_SDK_SHA=835b62a26162b229b441d1f6d4680383815a270809eb33522c0d480fa5002c4e ;;
    Darwin:x86_64) FOLIO_SDK_PACKAGE=commandlinetools-mac_x86_64-15859902_latest.zip; FOLIO_SDK_SHA=c5a6378ab5cf7e0d5701921405115befff13e9ff7417fb588389338f8bd050f3 ;;
    Linux:*) FOLIO_SDK_PACKAGE=commandlinetools-linux-15859902_latest.zip; FOLIO_SDK_SHA=4e4c464f145a7512b57d088ac6c278c03c9eea610886b35a5e0804e74eedf583 ;;
  esac
  curl --fail --location --retry 3 "https://dl.google.com/android/repository/$FOLIO_SDK_PACKAGE" --output "$FOLIO_TOOLCHAIN/downloads/sdk-tools.zip"
  echo "$FOLIO_SDK_SHA  $FOLIO_TOOLCHAIN/downloads/sdk-tools.zip" | shasum -a 256 --check
  mkdir -p "$ANDROID_HOME/cmdline-tools" "$FOLIO_TOOLCHAIN/sdk-unpack"
  unzip -q "$FOLIO_TOOLCHAIN/downloads/sdk-tools.zip" -d "$FOLIO_TOOLCHAIN/sdk-unpack"
  mv "$FOLIO_TOOLCHAIN/sdk-unpack/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
fi

# Accept Android SDK licenses for the isolated SDK used to build this project.
set +o pipefail
yes | sdkmanager --sdk_root="$ANDROID_HOME" --licenses > "$FOLIO_TOOLCHAIN/sdk-licenses.log" 2>&1
FOLIO_LICENSE_STATUS=${PIPESTATUS[1]}
set -o pipefail
if [[ "$FOLIO_LICENSE_STATUS" != 0 ]]; then cat "$FOLIO_TOOLCHAIN/sdk-licenses.log" >&2; exit "$FOLIO_LICENSE_STATUS"; fi
sdkmanager --sdk_root="$ANDROID_HOME" 'platform-tools' 'platforms;android-36' 'build-tools;35.0.0' 'build-tools;36.0.0' > "$FOLIO_TOOLCHAIN/sdk-install.log" 2>&1
java -version
echo "Android SDK: $ANDROID_HOME"
echo 'Android SDK ready. Use: source scripts/android-env.sh'
