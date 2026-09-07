import { SAMPLE_RATE } from "./DeepFilter"

export interface DenoiseStreamOptions {
  attenuationLimit?: number
  context?: AudioContext
  wasmUrl?: string
}

export interface DenoiseStream {
  stream: MediaStream
  context: AudioContext
  setAttenuationLimit: (db: number) => void
  setEnabled: (enabled: boolean) => void
  destroy: () => void
}

async function workletModuleUrl(): Promise<string> {
  const url = new URL("./worklet.js", import.meta.url)
  return url.href
}

export async function denoiseStream(
  input: MediaStream,
  options: DenoiseStreamOptions = {},
): Promise<DenoiseStream> {
  const wasmUrl = options.wasmUrl ?? new URL("./df_bg.wasm", import.meta.url).href
  const wasmBytes = await fetch(wasmUrl).then((response) => {
    if (!response.ok) throw new Error(`Failed to fetch DeepFilterNet wasm (${response.status})`)
    return response.arrayBuffer()
  })
  const wasmModule = await WebAssembly.compile(wasmBytes)

  const context = options.context ?? new AudioContext({ sampleRate: SAMPLE_RATE })
  await context.audioWorklet.addModule(await workletModuleUrl())

  const source = context.createMediaStreamSource(input)
  const node = new AudioWorkletNode(context, "deepfilternet-processor", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount: 1,
    processorOptions: {
      wasmModule,
      attenuationLimit: options.attenuationLimit ?? 100,
    },
  })
  const destination = context.createMediaStreamDestination()
  source.connect(node)
  node.connect(destination)

  return {
    stream: destination.stream,
    context,
    setAttenuationLimit: (db) => {
      node.port.postMessage({ type: "setAttenuationLimit", value: db })
    },
    setEnabled: (enabled) => {
      node.port.postMessage({ type: "setEnabled", value: enabled })
    },
    destroy: () => {
      source.disconnect()
      node.disconnect()
      destination.disconnect()
    },
  }
}
