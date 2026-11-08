#!/usr/bin/env bash
# Baut die signierte Release-APK und legt sie samt meta.json dort ab, woher die Download-Seite
# (Marketing-Website /app, ausgeliefert vom Portal unter /download/android) sie holt.
#
#   ANDROID_PUBLISH_TARGET=<user>@<host>:<pfad> scripts/publish-android.sh
#
# Das Ziel steht bewusst nicht im (öffentlichen) Repo. Vorher in android/app/build.gradle
# versionCode hochzählen — ein Update mit gleicher Build-Nummer installiert Android nicht.
# Voraussetzungen: android/keystore.properties, android/app/google-services.json (ANDROID.md).
set -euo pipefail

: "${ANDROID_PUBLISH_TARGET:?ANDROID_PUBLISH_TARGET=<user>@<host>:<pfad> setzen}"
MIN_TRACKER="6.5.6"   # ab dieser Tracker-Version nehmen Instanzen die App an (Brücke, FCM, Nutzung)

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21}"

cd "$ROOT"
npx cap sync android >/dev/null            # ohne CAP_DEV_URL; der Release-Wächter prüft das
(cd android && ./gradlew -q assembleRelease)
APK="android/app/build/outputs/apk/release/app-release.apk"

APKSIGNER="$(ls -d "$SDK"/build-tools/*/apksigner | tail -1)"
"$APKSIGNER" verify "$APK"                  # bricht bei unsignierter APK ab

VERSION="$(sed -n 's/^ *versionName "\(.*\)"$/\1/p' android/app/build.gradle)"
BUILD="$(sed -n 's/^ *versionCode \([0-9]*\)$/\1/p' android/app/build.gradle)"
SHA256="$(shasum -a 256 "$APK" | cut -d' ' -f1)"
SIZE="$(stat -f%z "$APK" 2>/dev/null || stat -c%s "$APK")"

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp "$APK" "$STAGE/app-release.apk"
cat > "$STAGE/meta.json" <<JSON
{"version":"$VERSION","build":"$BUILD","sha256":"$SHA256","size":$SIZE,"publishedAt":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","minTracker":"$MIN_TRACKER"}
JSON

# Die APK wird unter neuem Namen hochgeladen und dann umbenannt, damit nie eine halbe Datei ausgeliefert
# wird. meta.json folgt Sekunden später — so lange zeigt die Seite noch die Angaben der alten Version.
HOST="${ANDROID_PUBLISH_TARGET%%:*}"; DIR="${ANDROID_PUBLISH_TARGET#*:}"
ssh "$HOST" "mkdir -p '$DIR'"
scp -q "$STAGE/app-release.apk" "$HOST:$DIR/app-release.apk.new"
ssh "$HOST" "mv '$DIR/app-release.apk.new' '$DIR/app-release.apk'"
scp -q "$STAGE/meta.json" "$HOST:$DIR/meta.json"
echo "Veröffentlicht: $VERSION (Build $BUILD), $SIZE Bytes, SHA-256 $SHA256"
