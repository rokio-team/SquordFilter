#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PKG="$ROOT/packages/web"
CRATE="$ROOT/libDF"

if ! command -v wasm-pack >/dev/null 2>&1; then
  echo "wasm-pack is required. Install: cargo install wasm-pack" >&2
  exit 1
fi

rustup target add wasm32-unknown-unknown >/dev/null

export RUSTFLAGS='-C target-feature=+simd128 --cfg getrandom_backend="wasm_js"'

wasm-pack build "$CRATE" \
  --target web \
  --release \
  --no-opt \
  --out-dir "$PKG/pkg" \
  --out-name df \
  -- --features wasm --no-default-features

rm -f "$PKG/pkg/.gitignore" "$PKG/pkg/package.json" "$PKG/pkg/README.md"

cd "$PKG"
npx tsc -p tsconfig.json --emitDeclarationOnly

npx esbuild src/index.ts \
  --bundle \
  --format=esm \
  --platform=browser \
  --outfile=dist/index.js \
  --external:./df_bg.wasm

npx esbuild src/worklet.ts \
  --bundle \
  --format=iife \
  --platform=browser \
  --define:import.meta.url='""' \
  --outfile=dist/worklet.js

cp "$PKG/pkg/df_bg.wasm" "$PKG/dist/df_bg.wasm"
cp "$ROOT/LICENSE" "$ROOT/LICENSE-MIT" "$ROOT/LICENSE-APACHE" "$PKG/"
