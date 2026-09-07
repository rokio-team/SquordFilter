# @lofcz/deepfilternet-web

Browser build of [DeepFilterNet3](https://github.com/Rikorose/DeepFilterNet) (`libDF` wasm feature).

This package is the `lofcz/DeepFilterNet` fork: tract 0.23 (WASM SIMD kernels, [upstream #695](https://github.com/Rikorose/DeepFilterNet/pull/695)) so a 480-sample / 48 kHz frame stays under a millisecond in V8. DeepFilterNet3 weights are baked into the wasm.

## Install

```bash
npm install @lofcz/deepfilternet-web
```

Copy `node_modules/@lofcz/deepfilternet-web/dist/df_bg.wasm` and `dist/worklet.js` next to the bundled JS, or let the bundler follow `import.meta.url`.

## Denoise a microphone stream

```ts
import { denoiseStream } from "@lofcz/deepfilternet-web"

const mic = await navigator.mediaDevices.getUserMedia({
  audio: { echoCancellation: true, autoGainControl: true, noiseSuppression: false },
})
const { stream, destroy } = await denoiseStream(mic)
```

`stream` is 48 kHz mono. Hand it to VAD, a recorder, or another `AudioContext`.

## Process frames yourself

```ts
import { DeepFilter } from "@lofcz/deepfilternet-web"

const df = await DeepFilter.create()
const clean = df.process(frame) // Float32, df.frameLength samples at 48 kHz
df.destroy()
```

## Build from this repo

```
RUSTFLAGS='-C target-feature=+simd128 --cfg getrandom_backend="wasm_js"' \
  wasm-pack build libDF --target web --release -- --features wasm --no-default-features
npm install
npm run build
```

First npm publish is `./bootstrap-publish.sh`. Later releases: `gh workflow run release.yml -f release_type=patch`.
