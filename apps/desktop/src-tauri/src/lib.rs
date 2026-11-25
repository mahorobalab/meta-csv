use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CsvPayload {
    file_name: String,
    csv_base64: String,
    meta_text: Option<String>,
}

#[tauri::command]
fn get_initial_file() -> Option<String> {
    std::env::args().nth(1).filter(|arg| Path::new(arg).is_file())
}

#[tauri::command]
fn load_csv_with_meta(path: String) -> Result<CsvPayload, String> {
    let csv_path = Path::new(&path);
    let bytes = fs::read(csv_path).map_err(|e| format!("Failed to read CSV: {e}"))?;
    let file_name = csv_path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "untitled.csv".to_string());

    let meta_path = format!("{path}.meta.jsonc");
    let meta_text = fs::read_to_string(&meta_path).ok();

    Ok(CsvPayload {
        file_name,
        csv_base64: STANDARD.encode(bytes),
        meta_text,
    })
}

#[tauri::command]
fn save_csv_bytes(path: String, csv_base64: String) -> Result<(), String> {
    let bytes = STANDARD
        .decode(csv_base64)
        .map_err(|e| format!("Failed to decode CSV bytes: {e}"))?;
    fs::write(&path, bytes).map_err(|e| format!("Failed to write CSV: {e}"))
}

#[tauri::command]
fn save_meta_text(path: String, meta_text: String) -> Result<(), String> {
    let meta_path = format!("{path}.meta.jsonc");
    fs::write(&meta_path, meta_text).map_err(|e| format!("Failed to write .meta.jsonc: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_initial_file,
            load_csv_with_meta,
            save_csv_bytes,
            save_meta_text
        ])
        .run(tauri::generate_context!())
        .expect("error while running MetaCSV desktop application");
}
