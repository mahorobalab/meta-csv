mod bundle;
mod history;

use bundle::{BundleExportResult, BundleOpenMeta};
use history::{
    GixHistoryRepository, HistoryRestoreMeta, HistoryRetentionPolicy, HistorySnapshotMeta,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
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
    language: Option<String>,
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
    #[serde(default)]
    history_enabled: Option<bool>,
    #[serde(default)]
    history_retention_mode: Option<String>,
    #[serde(default)]
    history_max_count: Option<u32>,
    #[serde(default)]
    history_max_total_size_mb: Option<u32>,
    #[serde(default)]
    history_max_data_file_size_mb: Option<u32>,
}

fn default_theme() -> String {
    "system".to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: default_theme(),
            language: None,
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
            history_enabled: None,
            history_retention_mode: None,
            history_max_count: None,
            history_max_total_size_mb: None,
            history_max_data_file_size_mb: None,
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
    language: Option<String>,
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
    history_enabled: Option<bool>,
    history_retention_mode: Option<String>,
    history_max_count: Option<u32>,
    history_max_total_size_mb: Option<u32>,
    history_max_data_file_size_mb: Option<u32>,
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
        if let Some(lang) = language {
            if matches!(
                lang.as_str(),
                "auto" | "en" | "ja" | "zh-cn" | "zh-tw" | "ko" | "de" | "fr" | "es"
            ) {
                data.language = Some(lang);
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
        if let Some(he) = history_enabled {
            data.history_enabled = Some(he);
        }
        if let Some(mode) = history_retention_mode {
            if matches!(mode.as_str(), "count" | "sizeMb") {
                data.history_retention_mode = Some(mode);
            }
        }
        if let Some(mc) = history_max_count {
            data.history_max_count = Some(mc.clamp(1, 500));
        }
        if let Some(ms) = history_max_total_size_mb {
            data.history_max_total_size_mb = Some(ms.clamp(1, 2048));
        }
        if let Some(md) = history_max_data_file_size_mb {
            data.history_max_data_file_size_mb = Some(md.clamp(0, 1024));
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

struct WriteSession {
    writer: BufWriter<fs::File>,
    temp_path: PathBuf,
    target_path: PathBuf,
}

struct WriteSessionStore {
    next_id: AtomicU64,
    sessions: Mutex<HashMap<u64, WriteSession>>,
}

impl WriteSessionStore {
    fn new() -> Self {
        Self {
            next_id: AtomicU64::new(1),
            sessions: Mutex::new(HashMap::new()),
        }
    }
}

#[tauri::command]
fn begin_file_write(
    path: String,
    state: tauri::State<'_, WriteSessionStore>,
) -> Result<u64, String> {
    let target_path = PathBuf::from(&path);
    let id = state.next_id.fetch_add(1, Ordering::Relaxed);
    let file_name = target_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("metatext");
    let temp_name = format!(".{file_name}.metatext-tmp-{}-{id}", std::process::id());
    let temp_path = target_path.with_file_name(temp_name);

    let file = fs::File::create(&temp_path)
        .map_err(|e| format!("Failed to create temp file for streaming write: {e}"))?;
    let writer = BufWriter::with_capacity(256 * 1024, file);

    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "Failed to lock write session store".to_string())?;
    sessions.insert(
        id,
        WriteSession {
            writer,
            temp_path,
            target_path,
        },
    );
    Ok(id)
}

#[tauri::command]
fn write_file_chunk(
    request: Request<'_>,
    state: tauri::State<'_, WriteSessionStore>,
) -> Result<(), String> {
    let write_id_str = request
        .headers()
        .get("x-write-id")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| "Missing x-write-id header".to_string())?;
    let write_id: u64 = write_id_str
        .parse()
        .map_err(|_| "Invalid x-write-id header".to_string())?;

    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(data) => data.as_slice(),
        tauri::ipc::InvokeBody::Json(_) => {
            return Err("Expected raw binary body for write_file_chunk".to_string())
        }
    };

    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "Failed to lock write session store".to_string())?;
    let session = sessions
        .get_mut(&write_id)
        .ok_or_else(|| format!("Unknown write session {write_id}"))?;

    session
        .writer
        .write_all(bytes)
        .map_err(|e| format!("Failed to write chunk: {e}"))
}

#[tauri::command]
fn finish_file_write(
    write_id: u64,
    state: tauri::State<'_, WriteSessionStore>,
) -> Result<(), String> {
    let mut session = {
        let mut sessions = state
            .sessions
            .lock()
            .map_err(|_| "Failed to lock write session store".to_string())?;
        sessions
            .remove(&write_id)
            .ok_or_else(|| format!("Unknown write session {write_id}"))?
    };

    let temp_path = session.temp_path;
    let target_path = session.target_path;

    if let Err(e) = session.writer.flush() {
        drop(session.writer);
        let _ = fs::remove_file(&temp_path);
        return Err(format!("Failed to flush temp file: {e}"));
    }
    // Close file handle explicitly before renaming (required on Windows).
    drop(session.writer);

    if let Err(rename_err) = fs::rename(&temp_path, &target_path) {
        if target_path.exists() {
            fs::remove_file(&target_path).map_err(|e| {
                let _ = fs::remove_file(&temp_path);
                format!("Failed to replace target file: {e} (rename error: {rename_err})")
            })?;
            fs::rename(&temp_path, &target_path).map_err(|e| {
                let _ = fs::remove_file(&temp_path);
                format!("Failed to finalize temp file: {e}")
            })?;
        } else {
            let _ = fs::remove_file(&temp_path);
            return Err(format!("Failed to finalize temp file: {rename_err}"));
        }
    }

    Ok(())
}

#[tauri::command]
fn abort_file_write(
    write_id: u64,
    state: tauri::State<'_, WriteSessionStore>,
) -> Result<(), String> {
    let session = {
        let mut sessions = state
            .sessions
            .lock()
            .map_err(|_| "Failed to lock write session store".to_string())?;
        sessions.remove(&write_id)
    };
    if let Some(session) = session {
        let temp_path = session.temp_path;
        drop(session.writer);
        let _ = fs::remove_file(&temp_path);
    }
    Ok(())
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FileAppendResponse {
    bytes: Vec<u8>,
    next_offset: u64,
    truncated: bool,
}

#[tauri::command]
fn read_file_append(path: String, offset: u64) -> Result<FileAppendResponse, String> {
    use std::io::{Read, Seek, SeekFrom};

    let mut file = fs::File::open(&path)
        .map_err(|e| format!("Failed to open file for tail read '{}': {}", path, e))?;
    let file_len = file
        .metadata()
        .map_err(|e| format!("Failed to stat file '{}': {}", path, e))?
        .len();

    if file_len < offset {
        return Ok(FileAppendResponse {
            bytes: Vec::new(),
            next_offset: file_len,
            truncated: true,
        });
    }
    if file_len == offset {
        return Ok(FileAppendResponse {
            bytes: Vec::new(),
            next_offset: offset,
            truncated: false,
        });
    }

    const MAX_CHUNK_BYTES: u64 = 4 * 1024 * 1024;
    let to_read = (file_len - offset).min(MAX_CHUNK_BYTES) as usize;
    file.seek(SeekFrom::Start(offset))
        .map_err(|e| format!("Failed to seek file '{}': {}", path, e))?;
    let mut buf = vec![0u8; to_read];
    let n = file
        .read(&mut buf)
        .map_err(|e| format!("Failed to read appended bytes '{}': {}", path, e))?;
    buf.truncate(n);

    Ok(FileAppendResponse {
        bytes: buf,
        next_offset: offset + n as u64,
        truncated: false,
    })
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

fn resolve_history_repo_for_read(file_path: &Path) -> Result<Option<GixHistoryRepository>, String> {
    if bundle::is_metatext_zip_path(file_path) {
        let Some(cache_dir) = bundle::extract_bundle_history_to_temp(file_path)? else {
            return Ok(None);
        };
        return Ok(Some(GixHistoryRepository::from_repo_dir(cache_dir)));
    }
    Ok(Some(GixHistoryRepository::for_file(file_path)))
}

#[tauri::command]
async fn history_save_snapshot(
    file_path: String,
    message: String,
    include_data: bool,
    meta_text: String,
    policy: HistoryRetentionPolicy,
) -> Result<Option<HistorySnapshotMeta>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target = Path::new(&file_path);
        if bundle::is_metatext_zip_path(target) {
            return bundle::save_bundle_snapshot_atomic(
                target,
                &message,
                include_data,
                &meta_text,
                &policy,
            );
        }
        let repo = GixHistoryRepository::for_file(target);
        repo.save_snapshot_from_file(target, &message, include_data, &meta_text, &policy)
    })
    .await
    .map_err(|e| format!("History task join error: {e}"))?
}

#[tauri::command]
async fn history_list_snapshots(
    file_path: String,
    limit: Option<usize>,
) -> Result<Vec<HistorySnapshotMeta>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(repo) = resolve_history_repo_for_read(Path::new(&file_path))? else {
            return Ok(Vec::new());
        };
        repo.list_snapshots(limit)
    })
    .await
    .map_err(|e| format!("History task join error: {e}"))?
}

#[tauri::command]
async fn history_restore_snapshot_meta(
    file_path: String,
    id: String,
) -> Result<HistoryRestoreMeta, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(repo) = resolve_history_repo_for_read(Path::new(&file_path))? else {
            return Err("No history exists in this bundle".to_string());
        };
        repo.restore_snapshot_meta(&id)
    })
    .await
    .map_err(|e| format!("History task join error: {e}"))?
}

#[tauri::command]
async fn history_restore_snapshot_data(
    file_path: String,
    id: String,
) -> Result<Response, String> {
    let bytes = tauri::async_runtime::spawn_blocking(move || {
        let Some(repo) = resolve_history_repo_for_read(Path::new(&file_path))? else {
            return Err("No history exists in this bundle".to_string());
        };
        repo.restore_snapshot_data(&id)
    })
    .await
    .map_err(|e| format!("History task join error: {e}"))??;
    Ok(Response::new(bytes))
}

#[tauri::command]
async fn history_storage_usage(file_path: String) -> Result<u64, String> {
    tauri::async_runtime::spawn_blocking(move || {
        match resolve_history_repo_for_read(Path::new(&file_path)) {
            Ok(Some(repo)) => repo.storage_usage_bytes(),
            _ => 0,
        }
    })
    .await
    .map_err(|e| format!("History task join error: {e}"))
}

#[tauri::command]
async fn history_clear(file_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let repo = GixHistoryRepository::for_file(Path::new(&file_path));
        repo.clear()
    })
    .await
    .map_err(|e| format!("History task join error: {e}"))?
}

#[tauri::command]
async fn export_metatext_bundle(
    source_path: String,
    dest_path: String,
    include_history: bool,
    format: Option<String>,
) -> Result<BundleExportResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        bundle::export_metatext_bundle(
            Path::new(&source_path),
            Path::new(&dest_path),
            include_history,
            format.as_deref(),
        )
    })
    .await
    .map_err(|e| format!("Bundle export task join error: {e}"))?
}

#[tauri::command]
async fn load_bundle_meta(path: String) -> Result<BundleOpenMeta, String> {
    tauri::async_runtime::spawn_blocking(move || bundle::load_bundle_meta(Path::new(&path)))
        .await
        .map_err(|e| format!("Bundle load task join error: {e}"))?
}

#[tauri::command]
async fn load_bundle_data(path: String) -> Result<Response, String> {
    let bytes = tauri::async_runtime::spawn_blocking(move || {
        bundle::load_bundle_data(Path::new(&path))
    })
    .await
    .map_err(|e| format!("Bundle load task join error: {e}"))??;
    Ok(Response::new(bytes))
}

#[tauri::command]
fn save_bundle_data(request: Request<'_>) -> Result<(), String> {
    let encoded_path = request
        .headers()
        .get("x-file-path")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| "Missing x-file-path header".to_string())?;
    let path = percent_decode(encoded_path)?;
    match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => {
            bundle::update_bundle_atomic(Path::new(&path), Some(bytes), None)
        }
        tauri::ipc::InvokeBody::Json(_) => Err("Expected raw binary payload".to_string()),
    }
}

#[tauri::command]
async fn save_bundle_meta(path: String, meta_text: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        bundle::update_bundle_atomic(Path::new(&path), None, Some(&meta_text))
    })
    .await
    .map_err(|e| format!("Bundle save meta task join error: {e}"))?
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
            app.manage(WriteSessionStore::new());

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
            read_file_append,
            load_meta_text,
            save_csv_raw,
            begin_file_write,
            write_file_chunk,
            finish_file_write,
            abort_file_write,
            save_meta_text,
            read_clipboard_text,
            write_clipboard_text,
            write_clipboard_html,
            history_save_snapshot,
            history_list_snapshots,
            history_restore_snapshot_meta,
            history_restore_snapshot_data,
            history_storage_usage,
            history_clear,
            export_metatext_bundle,
            load_bundle_meta,
            load_bundle_data,
            save_bundle_data,
            save_bundle_meta
        ])
        .run(tauri::generate_context!())
        .expect("error while running MetaText Editor desktop application");
}
