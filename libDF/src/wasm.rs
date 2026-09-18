use std::boxed::Box;

use ndarray::prelude::*;
use wasm_bindgen::prelude::*;

use crate::tract::*;

#[wasm_bindgen]
pub struct DFState(crate::tract::DfTract);

#[wasm_bindgen]
impl DFState {
    fn new(df_params: DfParams, channels: usize, atten_lim: f32) -> Self {
        // The library default runs frames with an LSNR between 20 and 30 dB through the ERB mask
        // alone, which drops the low bins the deep-filter stage is trained to rebuild; keeping the
        // DF stage on wherever the ERB stage runs is what the native CLI effectively does.
        let r_params = RuntimeParams::default_with_ch(channels)
            .with_atten_lim(atten_lim)
            .with_thresholds(-10., 30., 30.);
        let m =
            DfTract::new(df_params, &r_params).expect("Could not initialize DeepFilter runtime.");
        DFState(m)
    }
    fn boxed(self) -> Box<DFState> {
        Box::new(self)
    }
}

/// Create a DeepFilterNet Model
///
/// Args:
///     - path: File path to a DeepFilterNet tar.gz onnx model
///     - atten_lim: Attenuation limit in dB.
///
/// Returns:
///     - DF state doing the full processing: stft, DNN noise reduction, istft.
#[wasm_bindgen]
pub unsafe fn df_create(
    model_bytes: &[u8],
    // channels: usize,
    atten_lim: f32,
) -> *mut DFState {
    let df = DFState::new(DfParams::from_bytes(model_bytes).expect("Could not load model"), 1, atten_lim);
    Box::into_raw(df.boxed())
}

/// Create a DeepFilterNet Model using the DeepFilterNet3 weights baked into this build.
#[wasm_bindgen]
pub unsafe fn df_create_default(atten_lim: f32) -> *mut DFState {
    let df = DFState::new(DfParams::default(), 1, atten_lim);
    Box::into_raw(df.boxed())
}

/// Free a DeepFilterNet Model created via df_create() or df_create_default().
#[wasm_bindgen]
pub unsafe fn df_free(st: *mut DFState) {
    if !st.is_null() {
        drop(Box::from_raw(st));
    }
}

/// Get DeepFilterNet frame size in samples.
#[wasm_bindgen]
pub unsafe fn df_get_frame_length(st: *mut DFState) -> usize {
    let state = st.as_mut().expect("Invalid pointer");
    state.0.hop_size
}

/// Set DeepFilterNet attenuation limit.
///
/// Args:
///     - lim_db: New attenuation limit in dB.
#[wasm_bindgen]
pub unsafe fn df_set_atten_lim(st: *mut DFState, lim_db: f32) {
    let state = st.as_mut().expect("Invalid pointer");
    state.0.set_atten_lim(lim_db)
}

/// Set the local-SNR thresholds that decide which stages run for a frame.
///
/// Args:
///     - min_db: below this the frame is treated as noise only and zeroed.
///     - max_erb_db: above this the frame passes through untouched.
///     - max_df_db: above this the deep-filter stage is skipped; keep it >= max_erb_db.
#[wasm_bindgen]
pub unsafe fn df_set_thresholds(st: *mut DFState, min_db: f32, max_erb_db: f32, max_df_db: f32) {
    let state = st.as_mut().expect("Invalid pointer");
    state.0.min_db_thresh = min_db;
    state.0.max_db_erb_thresh = max_erb_db;
    state.0.max_db_df_thresh = max_df_db;
}

/// Set DeepFilterNet post filter beta. A beta of 0 disables the post filter.
///
/// Args:
///     - beta: Post filter attenuation. Suitable range between 0.05 and 0;
#[wasm_bindgen]
pub unsafe fn df_set_post_filter_beta(st: *mut DFState, beta: f32) {
    let state = st.as_mut().expect("Invalid pointer");
    state.0.set_pf_beta(beta)
}

/// Processes a chunk of samples.
///
/// Args:
///     - df_state: Created via df_create()
///     - input: Input buffer of length df_get_frame_length()
///     - output: Output buffer of length df_get_frame_length()
///
/// Returns:
///     - Local SNR of the current frame.
#[wasm_bindgen]
pub unsafe fn df_process_frame(st: *mut DFState, input: &[f32]) -> js_sys::Float32Array {
    let state = st.as_mut().expect("Invalid pointer");
    let input = ArrayView2::from_shape((1, state.0.hop_size), input).unwrap();

    let mut output = Array2::zeros((1, state.0.hop_size));
    let output_view = output.view_mut();
    let _lsnr = state.0.process(input, output_view).expect("Failed to process DF frame");
    js_sys::Float32Array::from(output.as_slice().unwrap())
}
