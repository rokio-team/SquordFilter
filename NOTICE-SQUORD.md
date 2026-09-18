# SquordFilter

SquordFilter is the voice noise suppressor Squord runs in the browser. It is a fork of
**DeepFilterNet** by Hendrik Schröter (<https://github.com/Rikorose/DeepFilterNet>), by way of
**lofcz/DeepFilterNet** (<https://github.com/lofcz/DeepFilterNet>), which added the WebAssembly
SIMD build. The DeepFilterNet3 model weights are unchanged.

The code is used under the MIT License (`LICENSE-MIT`); the Apache License 2.0 (`LICENSE-APACHE`)
is kept alongside, as the upstream project is dual-licensed. Copyright (c) 2021 Hendrik Schröter
and the DeepFilterNet contributors. Squord's changes are released under the same terms.

This fork is not affiliated with or endorsed by the DeepFilterNet authors.

## Changes from upstream

- `libDF/src/wasm.rs`: the WebAssembly state is created with local-SNR thresholds of
  -10/30/30 dB instead of the library default of -10/30/20 dB, and `df_set_thresholds` is
  exported so they can be changed at runtime. With the default, frames whose local SNR falls
  between 20 and 30 dB skip the deep-filter stage and lose the low bins that stage is trained to
  rebuild; on real speech with moderate noise that dropped about a third of the voice frames by
  more than 10 dB.
- `squord/verify.mjs`: a regression check that runs real speech plus noise through the built wasm
  and fails if the voice loses more than 1 dB or the noise is not reduced.
- `.github/workflows/squordfilter.yml`: builds the wasm, runs the check, and publishes a release on
  `squordfilter-v*` tags.

## Release assets

| File | What it is |
| --- | --- |
| `squordfilter_bg.wasm.gz` | the wasm, gzipped (the raw file is over some static hosts' per-file limit) |
| `SHA256SUMS` | checksums of every asset |
| `LICENSE-MIT`, `LICENSE-APACHE`, `NOTICE-SQUORD.md` | the licences and this notice, to ship with the wasm |
