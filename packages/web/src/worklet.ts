import { initSync, df_create_default, df_get_frame_length, df_process_frame, df_set_atten_lim } from "../pkg/df.js"

const PROCESSOR_NAME = "deepfilternet-processor"
const WORKLET_QUANTUM = 128

interface ProcessorOptions {
  wasmModule: WebAssembly.Module
  attenuationLimit?: number
}

class DeepFilterProcessor extends AudioWorkletProcessor {
  #handle = 0
  #frameLength = 0
  #input = new Float32Array(0)
  #output = new Float32Array(0)
  #temp = new Float32Array(0)
  #write = 0
  #readIn = 0
  #writeOut = 0
  #readOut = 0
  #ready = false
  #bypass = false

  constructor(options: AudioWorkletNodeOptions) {
    super()
    const opts = options.processorOptions as ProcessorOptions
    try {
      initSync({ module: opts.wasmModule })
      this.#handle = df_create_default(opts.attenuationLimit ?? 100)
      this.#frameLength = df_get_frame_length(this.#handle)
      const ring = this.#frameLength * 4
      this.#input = new Float32Array(ring)
      this.#output = new Float32Array(ring)
      this.#temp = new Float32Array(this.#frameLength)
      this.#ready = true
    } catch {
      this.#ready = false
    }
    this.port.onmessage = (event: MessageEvent<{ type: string; value?: number | boolean }>) => {
      if (event.data.type === "setAttenuationLimit" && typeof event.data.value === "number") {
        if (this.#ready) df_set_atten_lim(this.#handle, event.data.value)
      }
      if (event.data.type === "setEnabled") {
        this.#bypass = event.data.value === false
      }
    }
  }

  #available(write: number, read: number): number {
    return (write - read + this.#input.length) % this.#input.length
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0]
    const output = outputs[0]?.[0]
    if (!input || !output) return true

    if (!this.#ready || this.#bypass) {
      for (const dest of outputs) {
        for (const channel of dest) channel.set(input)
      }
      return true
    }

    const ring = this.#input.length
    for (let i = 0; i < input.length; i++) {
      this.#input[this.#write] = input[i]
      this.#write = (this.#write + 1) % ring
    }

    while (this.#available(this.#write, this.#readIn) >= this.#frameLength) {
      for (let i = 0; i < this.#frameLength; i++) {
        this.#temp[i] = this.#input[this.#readIn]
        this.#readIn = (this.#readIn + 1) % ring
      }
      const processed = df_process_frame(this.#handle, this.#temp)
      for (let i = 0; i < processed.length; i++) {
        this.#output[this.#writeOut] = processed[i]
        this.#writeOut = (this.#writeOut + 1) % ring
      }
    }

    if (this.#available(this.#writeOut, this.#readOut) >= WORKLET_QUANTUM) {
      for (const dest of outputs) {
        for (const channel of dest) {
          let pos = this.#readOut
          for (let i = 0; i < WORKLET_QUANTUM; i++) {
            channel[i] = this.#output[pos]
            pos = (pos + 1) % ring
          }
        }
      }
      this.#readOut = (this.#readOut + WORKLET_QUANTUM) % ring
    }
    return true
  }
}

registerProcessor(PROCESSOR_NAME, DeepFilterProcessor)
