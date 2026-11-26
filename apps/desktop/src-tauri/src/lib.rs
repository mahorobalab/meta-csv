use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::ipc::{Request, Response};
use tauri::{Manager, PhysicalPosition, PhysicalSize, Position, Size, Theme, WebviewWindow, WindowEvent};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WindowState {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    #[serde(default)]
    maximized: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    #[serde(default = "default_theme")]
    theme: String, // "system" | "light" | "dark"
    #[serde(default)]
    window: Option<WindowState>,
    #[serde(default)]
    last_directory: Option<String>,
    #[serde(default)]
    default_font_size: Option<u32>,
    #[serde(default)]
    default_row_height: Option<u32>,
    #[serde(default)]
    default_marker_color: Option<String>,
    #[serde(default)]
    show_row_numbers: Option<bool>,
    #[serde(default)]
    no_header_column_style: Option<String>,
    #[serde(default)]
    zebra_striping: Option<bool>,
    #[serde(default)]
    confirm_hide_column: Option<bool>,
    #[serde(default)]
    reopen_last_files: Option<bool>,
    #[serde(default)]
    last_opened_files: Option<Vec<String>>,
    #[serde(default)]
    last_active_file: Option<String>,
}

fn default_theme() -> String {
    "system".to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: default_theme(),
            window: None,
            last_directory: None,
            default_font_size: None,
            default_row_height: None,
            default_marker_color: None,
            show_row_numbers: None,
            no_header_column_style: None,
            zebra_striping: None,
            confirm_hide_column: None,
            reopen_last_files: None,
            last_opened_files: None,
            last_active_file: None,
        }
    }
}

struct SettingsStore {
    path: PathBuf,
    data: Mutex<AppSettings>,
}

impl SettingsStore {
    fn load(config_dir: PathBuf) -> Self {
        let path = config_dir.join("settings.json");
        let data = fs::read_to_string(&path)
            .ok()
            .and_then(|text| serde_json::from_str::<AppSettings>(&text).ok())
            .unwrap_or_default();
        Self {
            path,
            data: Mutex::new(data),
        }
    }

    fn persist(&self) {
        let snapshot = match self.data.lock() {
            Ok(guard) => guard.clone(),
            Err(_) => return,
        };
        if let Some(parent) = self.path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(&snapshot) {
            let _ = fs::write(&self.path, json);
        }
    }
}

fn parse_tauri_theme(theme: &str) -> Option<Theme> {
    match theme {
        "light" => Some(Theme::Light),
        "dark" => Some(Theme::Dark),
        _ => None, // "system" -> follow OS
    }
}

fn is_window_visible_on_any_monitor(window: &WebviewWindow, ws: &WindowState) -> bool {
    let monitors = match window.available_monitors() {
        Ok(m) if !m.is_empty() => m,
        _ => return false,
    };

    let win_left = ws.x;
    let win_top = ws.y;
    let win_right = ws.x.saturating_add(ws.width as i32);
    let win_bottom = ws.y.saturating_add(ws.height as i32);

    monitors.iter().any(|mon| {
        let pos = mon.position();
        let size = mon.size();
        let mon_left = pos.x;
        let mon_top = pos.y;
        let mon_right = pos.x.saturating_add(size.width as i32);
        let mon_bottom = pos.y.saturating_add(size.height as i32);

        let overlap_x = win_right.min(mon_right) - win_left.max(mon_left);
        let overlap_y = win_bottom.min(mon_bottom) - win_top.max(mon_top);
        let titlebar_reachable = win_top >= mon_top - 20 && win_top <= mon_bottom - 60;

        overlap_x >= 100 && overlap_y >= 60 && titlebar_reachable
    })
}

fn restore_window_state(window: &WebviewWindow, settings: &AppSettings) {
    let _ = window.set_theme(parse_tauri_theme(&settings.theme));

    if let Some(ws) = &settings.window {
        if ws.width >= 400 && ws.height >= 300 {
            let _ = window.set_size(Size::Physical(PhysicalSize::new(ws.width, ws.height)));
            if is_window_visible_on_any_monitor(window, ws) {
                let _ = window.set_position(Position::Physical(PhysicalPosition::new(ws.x, ws.y)));
            }
        }
        if ws.maximized {
            let _ = window.maximize();
        }
    }
}

fn capture_window_state(window: &WebviewWindow, store: &SettingsStore) {
    let is_minimized = window.is_minimized().unwrap_or(false);
    if is_minimized {
        return;
    }

    let is_maximized = window.is_maximized().unwrap_or(false);

    if let Ok(mut data) = store.data.lock() {
        if is_maximized {
            if let Some(ws) = data.window.as_mut() {
                ws.maximized = true;
            } else if let (Ok(pos), Ok(size)) = (window.outer_position(), window.inner_size()) {
                data.window = Some(WindowState {
                    x: pos.x,
                    y: pos.y,
                    width: size.width,
                    height: size.height,
                    maximized: true,
                });
            }
        } else if let (Ok(pos), Ok(size)) = (window.outer_position(), window.inner_size()) {
            if size.width >= 400 && size.height >= 300 {
                data.window = Some(WindowState {
                    x: pos.x,
                    y: pos.y,
                    width: size.width,
                    height: size.height,
                    maximized: false,
                });
            }
        }
    }
}

#[tauri::command]
fn get_app_settings(state: tauri::State<'_, SettingsStore>) -> AppSettings {
    let mut settings = state
        .data
        .lock()
        .map(|guard| guard.clone())
        .unwrap_or_default();
    if let Some(files) = settings.last_opened_files.as_mut() {
        files.retain(|p| Path::new(p).is_file());
    }
    if let Some(active) = settings.last_active_file.as_ref() {
        if !Path::new(active).is_file() {
            settings.last_active_file = None;
        }
    }
    settings
}

#[tauri::command]
fn update_app_settings(
    app: tauri::AppHandle,
    state: tauri::State<'_, SettingsStore>,
    theme: Option<String>,
    last_directory: Option<String>,
    default_font_size: Option<u32>,
    default_row_height: Option<u32>,
    default_marker_color: Option<String>,
    show_row_numbers: Option<bool>,
    no_header_column_style: Option<String>,
    zebra_striping: Option<bool>,
    confirm_hide_column: Option<bool>,
    reopen_last_files: Option<bool>,
    last_opened_files: Option<Vec<String>>,
    last_active_file: Option<String>,
) -> Result<AppSettings, String> {
    let updated = {
        let mut data = state
            .data
            .lock()
            .map_err(|_| "Failed to lock settings store".to_string())?;
        if let Some(t) = theme {
            let normalized = match t.as_str() {
                "light" | "dark" | "system" => t,
                _ => "system".to_string(),
            };
            data.theme = normalized;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_theme(parse_tauri_theme(&data.theme));
            }
        }
        if let Some(dir) = last_directory {
            data.last_directory = if dir.is_empty() { None } else { Some(dir) };
        }
        if let Some(fsz) = default_font_size {
            data.default_font_size = Some(fsz.clamp(9, 32));
        }
        if let Some(rh) = default_row_height {
            data.default_row_height = Some(rh.clamp(20, 200));
        }
        if let Some(mc) = default_marker_color {
            if matches!(mc.as_str(), "amber" | "rose" | "emerald" | "sky" | "violet") {
                data.default_marker_color = Some(mc);
            }
        }
        if let Some(srn) = show_row_numbers {
            data.show_row_numbers = Some(srn);
        }
        if let Some(ncs) = no_header_column_style {
            if matches!(ncs.as_str(), "excel" | "numbered") {
                data.no_header_column_style = Some(ncs);
            }
        }
        if let Some(zs) = zebra_striping {
            data.zebra_striping = Some(zs);
        }
        if let Some(chc) = confirm_hide_column {
            data.confirm_hide_column = Some(chc);
        }
        if let Some(rlf) = reopen_last_files {
            data.reopen_last_files = Some(rlf);
        }
        if let Some(files) = last_opened_files {
            data.last_opened_files = Some(files);
        }
        if let Some(active) = last_active_file {
            data.last_active_file = if active.is_empty() { None } else { Some(active) };
        }
        data.clone()
    };
    state.persist();
    Ok(updated)
}

#[tauri::command]
fn set_window_title(app: tauri::AppHandle, title: String) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_title(&title);
    }
}

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
    let meta_path = format!("{path}.metatext.jsonc");
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
    let meta_path = format!("{path}.metatext.jsonc");
    fs::write(&meta_path, meta_text).map_err(|e| format!("Failed to write .metatext.jsonc: {e}"))
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

#[tauri::command]
fn read_clipboard_text() -> Result<String, String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    match clipboard.get_text() {
        Ok(text) => Ok(text),
        Err(arboard::Error::ContentNotAvailable) => Ok(String::new()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn write_clipboard_text(text: String) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(text).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_clipboard_html(html: String, alt_text: String) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard
        .set_html(html, Some(alt_text))
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let config_dir = app
                .path()
                .app_config_dir()
                .unwrap_or_else(|_| PathBuf::from("."));
            let store = SettingsStore::load(config_dir);
            let initial_settings = store
                .data
                .lock()
                .map(|g| g.clone())
                .unwrap_or_default();
            app.manage(store);

            if let Some(window) = app.get_webview_window("main") {
                restore_window_state(&window, &initial_settings);
                let _ = window.show();
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            match event {
                WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
                    if let Some(webview) = window.app_handle().get_webview_window("main") {
                        let store = window.app_handle().state::<SettingsStore>();
                        capture_window_state(&webview, &store);
                    }
                }
                WindowEvent::CloseRequested { .. } => {
                    if let Some(webview) = window.app_handle().get_webview_window("main") {
                        let store = window.app_handle().state::<SettingsStore>();
                        capture_window_state(&webview, &store);
                        store.persist();
                    }
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_app_settings,
            update_app_settings,
            set_window_title,
            get_initial_file,
            load_csv_bytes,
            load_meta_text,
            save_csv_raw,
            save_meta_text,
            read_clipboard_text,
            write_clipboard_text,
            write_clipboard_html
        ])
        .run(tauri::generate_context!())
        .expect("error while running MetaCSV desktop application");
}
