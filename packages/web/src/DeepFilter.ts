import init, {
  df_create,
  df_create_default,
  df_free,
  df_get_frame_length,
  df_process_frame,
  df_set_atten_lim,
  df_set_post_filter_beta,
} from "../pkg/df.js"

export const SAMPLE_RATE = 48_000

export interface DeepFilterOptions {
  attenuationLimit?: number
  wasmUrl?: string
  model?: Uint8Array
}

export class DeepFilter {
  readonly frameLength: number
  readonly sampleRate = SAMPLE_RATE
  #handle: number

  private constructor(handle: number) {
    this.#handle = handle
    this.frameLength = df_get_frame_length(handle)
  }

  static async create(options: DeepFilterOptions = {}): Promise<DeepFilter> {
    const wasmUrl = options.wasmUrl ?? new URL("./df_bg.wasm", import.meta.url).href
    await init(wasmUrl)
    const atten = options.attenuationLimit ?? 100
    const handle = options.model
      ? df_create(options.model, atten)
      : df_create_default(atten)
    return new DeepFilter(handle)
  }

  process(frame: Float32Array): Float32Array {
    if (frame.length !== this.frameLength) {
      throw new Error(`DeepFilter expects ${this.frameLength} samples, got ${frame.length}`)
    }
    return df_process_frame(this.#handle, frame)
  }

  setAttenuationLimit(db: number): void {
    df_set_atten_lim(this.#handle, db)
  }

  setPostFilterBeta(beta: number): void {
    df_set_post_filter_beta(this.#handle, beta)
  }

  destroy(): void {
    df_free(this.#handle)
    this.#handle = 0
  }
}
