use std::fs;
use std::path::Path;
use tauri::ipc::{Request, Response};

#[tauri::command]
fn get_initial_file() -> Option<String> {
    std::env::args().nth(1).filter(|arg| Path::new(arg).is_file())
}

#[tauri::command]
fn load_csv_bytes(path: String) -> Result<Response, String> {
    let bytes = fs::read(&path).map_err(|e| format!("Failed to read CSV: {e}"))?;
    Ok(Response::new(bytes))
}

#[tauri::command]
fn load_meta_text(path: String) -> Option<String> {
    let meta_path = format!("{path}.meta.jsonc");
    fs::read_to_string(&meta_path).ok()
}

#[tauri::command]
fn save_csv_raw(request: Request<'_>) -> Result<(), String> {
    let encoded_path = request
        .headers()
        .get("x-file-path")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| "Missing x-file-path header".to_string())?;
    let path = percent_decode(encoded_path)?;

    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(data) => data.as_slice(),
        tauri::ipc::InvokeBody::Json(_) => {
            return Err("Expected raw binary body for save_csv_raw".to_string())
        }
    };

    fs::write(&path, bytes).map_err(|e| format!("Failed to write CSV: {e}"))
}

#[tauri::command]
fn save_meta_text(path: String, meta_text: String) -> Result<(), String> {
    let meta_path = format!("{path}.meta.jsonc");
    fs::write(&meta_path, meta_text).map_err(|e| format!("Failed to write .meta.jsonc: {e}"))
}

fn percent_decode(input: &str) -> Result<String, String> {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3])
                .map_err(|_| "Invalid UTF-8 in percent encoding".to_string())?;
            let val = u8::from_str_radix(hex, 16)
                .map_err(|_| "Invalid hex in percent encoding".to_string())?;
            out.push(val);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).map_err(|_| "Invalid UTF-8 path".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_initial_file,
            load_csv_bytes,
            load_meta_text,
            save_csv_raw,
            save_meta_text
        ])
        .run(tauri::generate_context!())
        .expect("error while running MetaCSV desktop application");
}
