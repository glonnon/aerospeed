#!/usr/bin/env bash
# Build a store-ready ZIP (Chrome-friendly). Run from the repo root.
set -euo pipefail

NAME="aerospeed"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="${1:-web-ext-artifacts}"
mkdir -p "$OUT"
STAMP="$(date +%Y%m%d)"

STAGE="$(mktemp -d)/$NAME"
mkdir -p "$STAGE"

# Extension runtime files
cp manifest.json background.js coach.html coach.js coach_boot.js "$STAGE/" 2>/dev/null || true
cp -r icons "$STAGE/"
cp -r src "$STAGE/"

# Exclude tests, docs, dev tooling
rm -rf "$STAGE"/tests "$STAGE"/node_modules 2>/dev/null || true
rm -f "$STAGE"/README.md "$STAGE"/PRIVACY.md "$STAGE"/PLAN.md "$STAGE"/tools/* 2>/dev/null || true
rm -rf "$STAGE"/tools 2>/dev/null || true

ZIP="$OUT/${NAME}-${STAMP}.zip"
(cd "$(dirname "$STAGE")" && zip -r -X "$DIR/$ZIP" "$NAME" >/dev/null)

rm -rf "$(dirname "$STAGE")"

echo "Built $ZIP"
echo "Note: AMO (Firefox) requires going through addons.mozilla.org signing/review, not sideloading."
echo "Note: the store reviewer will assess the extension_pages CSP (remote connect-src hosts for the optional AI WebGPU mode)."