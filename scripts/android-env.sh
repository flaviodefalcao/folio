#!/usr/bin/env bash
# Source from Bash: source scripts/android-env.sh
FOLIO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export ANDROID_HOME="${FOLIO_ANDROID_HOME:-$FOLIO_ROOT/.toolchain/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export ANDROID_USER_HOME="$FOLIO_ROOT/.toolchain/android-user"
export ANDROID_AVD_HOME="$FOLIO_ROOT/.toolchain/avd"
if [[ -d "$FOLIO_ROOT/.toolchain/jdk/Contents/Home" ]]; then
  export JAVA_HOME="$FOLIO_ROOT/.toolchain/jdk/Contents/Home"
elif [[ -d "$FOLIO_ROOT/.toolchain/jdk" ]]; then
  export JAVA_HOME="$FOLIO_ROOT/.toolchain/jdk"
fi
export GRADLE_USER_HOME="$FOLIO_ROOT/.toolchain/gradle-cache"
export PATH="${JAVA_HOME:+$JAVA_HOME/bin:}$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
