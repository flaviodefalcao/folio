#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
npx cap sync ios
node scripts/prepare-ios.mjs
if ! xcrun --find xcodebuild >/dev/null 2>&1; then
  echo 'iOS project prepared. Install full Xcode, open it to complete setup, then run npm run ios:build again.' >&2
  exit 2
fi
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath ios/DerivedData CODE_SIGNING_ALLOWED=NO build
