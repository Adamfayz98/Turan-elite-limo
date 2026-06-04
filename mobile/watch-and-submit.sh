#!/bin/bash
set -e
export EXPO_TOKEN="r6nylp7tIM406wecFBcaHXcHTmlVW9zn3G6VMN3T"
export EAS_BUILD_NO_EXPO_GO_WARNING=true

BUILD_ID="4cdefaf7-34f7-4351-88af-7c3c5c5aa8a0"
LOG="/tmp/eas-watcher.log"
cd /app/mobile

echo "[$(date)] Starting watcher for build $BUILD_ID (apple v8.0.8)" >> "$LOG"

for i in $(seq 1 60); do
    STATUS=$(npx --yes eas-cli@latest build:view "$BUILD_ID" 2>&1 | grep "^Status" | awk '{print $2, $3, $4}' | xargs)
    echo "[$(date)] poll #$i status=$STATUS" >> "$LOG"

    if [[ "$STATUS" == "finished" ]]; then
        echo "[$(date)] Build finished! Submitting to TestFlight..." >> "$LOG"
        npx --yes eas-cli@latest submit --platform ios --id "$BUILD_ID" --non-interactive >> "$LOG" 2>&1
        echo "[$(date)] Submit done. Exit code $?" >> "$LOG"
        exit 0
    fi
    if [[ "$STATUS" == *"errored"* || "$STATUS" == *"canceled"* ]]; then
        echo "[$(date)] Build failed." >> "$LOG"
        exit 1
    fi
    sleep 60
done
echo "[$(date)] Watcher timed out" >> "$LOG"
exit 2
