use rust_engine::{ControlInput, Engine};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct WasmEngine {
    engine: Engine,
    state_cache: [f32; 9],
    patch_cache: Vec<f32>,
}

#[wasm_bindgen]
impl WasmEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        let engine = Engine::new();
        let mut this = Self {
            engine,
            state_cache: [0.0; 9],
            patch_cache: Vec::new(),
        };
        this.refresh_caches();
        this
    }

    pub fn set_input(&mut self, rotate_x: f32, rotate_y: f32, zoom: f32, reset: u32) {
        self.engine.set_input(ControlInput {
            rotate_x,
            rotate_y,
            zoom,
            reset,
        });
    }

    pub fn tick(&mut self, dt_seconds: f32) {
        self.engine.tick(dt_seconds);
        self.refresh_caches();
    }

    pub fn render_state_ptr(&self) -> *const f32 {
        self.state_cache.as_ptr()
    }

    pub fn patches_ptr(&self) -> *const f32 {
        self.patch_cache.as_ptr()
    }

    pub fn patches_len(&self) -> usize {
        self.engine.surface_patches().len()
    }

    fn refresh_caches(&mut self) {
        let state = self.engine.render_state();
        self.state_cache = [
            state.radius,
            state.atmosphere_radius,
            state.rotation_x,
            state.rotation_y,
            state.cloud_rotation_y,
            state.camera_distance,
            state.light_x,
            state.light_y,
            state.light_z,
        ];

        self.patch_cache.clear();
        for patch in self.engine.surface_patches() {
            self.patch_cache.extend_from_slice(&[
                patch.lat_degrees,
                patch.lon_degrees,
                patch.radius_degrees,
                patch.stretch_x,
                patch.stretch_y,
            ]);
        }
    }
}

impl Default for WasmEngine {
    fn default() -> Self {
        Self::new()
    }
}

