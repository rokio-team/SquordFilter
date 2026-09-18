// Regression check for the SquordFilter wasm: real speech plus pink noise must come out with the
// voice intact and the noise reduced. The upstream thresholds (-10/30/20) fail this: the voice
// loses ~5 dB and about a third of its 10 ms frames drop by more than 10 dB.
import { readFileSync } from 'node:fs'
import { argv, exit } from 'node:process'

const [pkgDir = 'pkg'] = argv.slice(2)
const glue = await import(new URL(`${pkgDir}/df.js`, `file://${process.cwd()}/`).href)
const wasm = glue.initSync({ module: readFileSync(`${pkgDir}/df_bg.wasm`) })

function readWav16(path) {
  const b = readFileSync(path)
  let o = 12
  while (o < b.length) {
    const id = b.toString('ascii', o, o + 4)
    const len = b.readUInt32LE(o + 4)
    if (id === 'data') {
      const out = new Float32Array(len / 2)
      for (let i = 0; i < out.length; i++) out[i] = b.readInt16LE(o + 8 + i * 2) / 32768
      return out
    }
    o += 8 + len + (len & 1)
  }
  throw new Error(`no data chunk in ${path}`)
}

function pink(n) {
  let s = 5, b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    s = (s * 1664525 + 1013904223) >>> 0
    const w = (s / 4294967296) * 2 - 1
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852
    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898
    out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362
    b6 = w * 0.115926
  }
  return out
}

const FRAME = 480
const DELAY = 1440 // STFT window plus model lookahead, in samples at 48 kHz
const speech = readWav16('assets/clean_freesound_33711.wav')
const frames = Math.floor(speech.length / FRAME)
const energy = (x, f) => { let e = 0; for (let i = f * FRAME; i < (f + 1) * FRAME; i++) e += x[i] ** 2; return e }
let peak = 0
for (let f = 0; f < frames; f++) peak = Math.max(peak, energy(speech, f))
const active = Array.from({ length: frames }, (_, f) => energy(speech, f) > peak * 1e-3)

// Speech at -26 dBFS over active frames, pink noise at -50 dBFS: the case the old thresholds failed hardest.
let s = 0, c = 0
active.forEach((a, f) => { if (a) { s += energy(speech, f); c += FRAME } })
const noise = pink(speech.length)
const nRms = Math.sqrt(noise.reduce((a, v) => a + v * v, 0) / noise.length)
const g = 10 ** (-26 / 20) / Math.sqrt(s / c)
const h = 10 ** (-50 / 20) / nRms
const clean = speech.map((v) => v * g)
const input = clean.map((v, i) => v + noise[i] * h)

const state = glue.df_create_default(100)
const out = new Float32Array(input.length)
for (let i = 0; i + FRAME <= input.length; i += FRAME) out.set(glue.df_process_frame(state, input.subarray(i, i + FRAME)), i)

let sIn = 0, sOut = 0, nIn = 0, nOut = 0, speechFrames = 0, lost = 0
for (let f = 50; (f + 1) * FRAME + DELAY <= input.length; f++) {
  let ec = 0, eo = 0, en = 0
  for (let i = f * FRAME; i < (f + 1) * FRAME; i++) { ec += clean[i] ** 2; eo += out[i + DELAY] ** 2; en += (noise[i] * h) ** 2 }
  if (active[f]) { sIn += ec; sOut += eo; speechFrames++; if (eo < ec * 0.1) lost++ } else { nIn += en; nOut += eo }
}
const speechDb = 10 * Math.log10(sOut / sIn)
const lostPct = (100 * lost) / speechFrames
const noiseDb = 10 * Math.log10(nOut / nIn)
console.log(`speech ${speechDb.toFixed(2)} dB, frames lost ${lostPct.toFixed(1)}%, noise ${noiseDb.toFixed(1)} dB`)

const failures = []
if (speechDb < -1) failures.push(`speech lost ${speechDb.toFixed(2)} dB (limit -1 dB)`)
if (lostPct > 10) failures.push(`${lostPct.toFixed(1)}% of speech frames dropped by >10 dB (limit 10%)`)
if (noiseDb > -6) failures.push(`noise only reduced ${noiseDb.toFixed(1)} dB (need at least -6 dB)`)
if (typeof wasm.df_set_thresholds !== 'function') failures.push('df_set_thresholds is not exported by the wasm')
if (failures.length) { console.error('FAIL\n- ' + failures.join('\n- ')); exit(1) }
console.log('OK')
