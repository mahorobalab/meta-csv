//! Portable `.metatext.zip` bundle export (atomic write via temporary file).
//!
//! Archive layout (v0.1):
//! ```text
//! <name>.metatext.zip
//! ├── manifest.json
//! ├── data/
//! │   ├── <name>
//! │   └── <name>.metatext.jsonc
//! └── history/          (optional, default OFF)
//!     ├── HEAD
//!     ├── objects/...
//!     └── refs/...
//! ```

use crate::history::{
    adjacent_history_dir, GixHistoryRepository, HistoryRetentionPolicy, HistorySnapshotMeta,
};
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

const MAX_ZIP_ENTRIES: usize = 10_000;
const MAX_ZIP_UNCOMPRESSED_BYTES: u64 = 512 * 1024 * 1024; // 512 MB
const MAX_ZIP_COMPRESSION_RATIO: f64 = 100.0;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleManifest {
    pub bundle_version: String,
    pub format: String,
    pub source_file: String,
    pub sidecar_file: String,
    pub includes_history: bool,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub created_by: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleExportResult {
    pub dest_path: String,
    pub zip_bytes: u64,
    pub includes_history: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleOpenMeta {
    pub file_name: String,
    pub format: String,
    pub meta_text: String,
    pub includes_history: bool,
}

fn validate_entry_path(entry_path: &str) -> Result<String, String> {
    if entry_path.trim().is_empty() {
        return Err("Empty ZIP entry path".to_string());
    }
    if entry_path.bytes().any(|b| b < 0x20) {
        return Err(format!("Control character in ZIP entry path: {entry_path}"));
    }
    let normalized = entry_path.replace('\\', "/");
    if normalized.starts_with('/')
        || (normalized.len() >= 2
            && normalized.as_bytes()[0].is_ascii_alphabetic()
            && normalized.as_bytes()[1] == b':')
    {
        return Err(format!("Absolute path not allowed in ZIP: {entry_path}"));
    }
    for seg in normalized.split('/') {
        if seg == ".." {
            return Err(format!("Path traversal ('..') not allowed in ZIP: {entry_path}"));
        }
    }
    Ok(normalized)
}

fn validate_archive_and_read_manifest(
    archive: &mut ZipArchive<File>,
) -> Result<BundleManifest, String> {
    if archive.len() > MAX_ZIP_ENTRIES {
        return Err(format!(
            "ZIP contains too many entries ({} > {})",
            archive.len(),
            MAX_ZIP_ENTRIES
        ));
    }

    let mut total_uncompressed: u64 = 0;
    for i in 0..archive.len() {
        let entry = archive
            .by_index(i)
            .map_err(|e| format!("Failed to inspect ZIP entry #{i}: {e}"))?;
        let name = entry.name().to_string();
        validate_entry_path(&name)?;
        let uncomp = entry.size();
        let comp = entry.compressed_size();
        total_uncompressed = total_uncompressed.saturating_add(uncomp);
        if total_uncompressed > MAX_ZIP_UNCOMPRESSED_BYTES {
            return Err(format!(
                "ZIP uncompressed size exceeds limit ({total_uncompressed} > {MAX_ZIP_UNCOMPRESSED_BYTES} bytes)"
            ));
        }
        if uncomp >= 1024 * 1024 && comp > 0 {
            let ratio = (uncomp as f64) / (comp as f64);
            if ratio > MAX_ZIP_COMPRESSION_RATIO {
                return Err(format!(
                    "Suspicious compression ratio ({ratio:.1}x > {MAX_ZIP_COMPRESSION_RATIO}x) on {name}"
                ));
            }
        }
    }

    let mut manifest_entry = archive
        .by_name("manifest.json")
        .map_err(|_| "Invalid .metatext.zip: missing manifest.json".to_string())?;
    let mut manifest_text = String::new();
    manifest_entry
        .read_to_string(&mut manifest_text)
        .map_err(|e| format!("Failed to read manifest.json: {e}"))?;
    let manifest: BundleManifest = serde_json::from_str(&manifest_text)
        .map_err(|e| format!("Invalid manifest.json: {e}"))?;

    if manifest.bundle_version != "0.1" {
        return Err(format!(
            "Unsupported bundleVersion '{}'",
            manifest.bundle_version
        ));
    }
    let src_norm = validate_entry_path(&manifest.source_file)?;
    let sidecar_norm = validate_entry_path(&manifest.sidecar_file)?;
    if !src_norm.starts_with("data/") {
        return Err(format!(
            "manifest.sourceFile must be under data/: {}",
            manifest.source_file
        ));
    }
    if !sidecar_norm.starts_with("data/") || !sidecar_norm.ends_with(".metatext.jsonc") {
        return Err(format!(
            "manifest.sidecarFile must be under data/*.metatext.jsonc: {}",
            manifest.sidecar_file
        ));
    }
    Ok(manifest)
}

pub fn is_metatext_zip_path(path: &Path) -> bool {
    path.to_string_lossy()
        .to_lowercase()
        .ends_with(".metatext.zip")
}

/// Extracts `history/` from a `.metatext.zip` into a deterministic temp cache
/// directory keyed by canonical path + modified timestamp so `GixHistoryRepository`
/// can list, diff, and restore snapshots embedded inside the bundle.
pub fn extract_bundle_history_to_temp(zip_path: &Path) -> Result<Option<PathBuf>, String> {
    let file = File::open(zip_path)
        .map_err(|e| format!("Failed to open bundle {}: {e}", zip_path.display()))?;
    let mtime_ns = file
        .metadata()
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let mut archive = ZipArchive::new(file)
        .map_err(|e| format!("Invalid ZIP archive {}: {e}", zip_path.display()))?;
    let _manifest = validate_archive_and_read_manifest(&mut archive)?;

    let has_history_head = archive.by_name("history/HEAD").is_ok();
    if !has_history_head {
        return Ok(None);
    }

    let mut hasher = gix::hash::hasher(gix::hash::Kind::Sha1);
    hasher.update(zip_path.to_string_lossy().as_bytes());
    hasher.update(&mtime_ns.to_le_bytes());
    let key = hasher
        .try_finalize()
        .map(|d| d.to_hex().to_string())
        .unwrap_or_else(|_| "bundle".to_string());

    let cache_dir = std::env::temp_dir()
        .join("metatext-bundle-history")
        .join(key);
    if cache_dir.join("HEAD").is_file() {
        return Ok(Some(cache_dir));
    }

    fs::create_dir_all(&cache_dir)
        .map_err(|e| format!("Failed to create bundle history cache dir: {e}"))?;

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read entry #{i}: {e}"))?;
        if entry.is_dir() {
            continue;
        }
        let name = validate_entry_path(entry.name())?;
        let Some(rel) = name.strip_prefix("history/") else {
            continue;
        };
        if rel.is_empty() {
            continue;
        }
        let out_path = cache_dir.join(rel);
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create cache subdir: {e}"))?;
        }
        let mut out_file = File::create(&out_path)
            .map_err(|e| format!("Failed to extract history file {rel}: {e}"))?;
        io::copy(&mut entry, &mut out_file)
            .map_err(|e| format!("Failed to copy history file {rel}: {e}"))?;
    }

    Ok(Some(cache_dir))
}

pub fn load_bundle_meta(zip_path: &Path) -> Result<BundleOpenMeta, String> {
    let file = File::open(zip_path)
        .map_err(|e| format!("Failed to open bundle {}: {e}", zip_path.display()))?;
    let mut archive = ZipArchive::new(file)
        .map_err(|e| format!("Invalid ZIP archive {}: {e}", zip_path.display()))?;
    let manifest = validate_archive_and_read_manifest(&mut archive)?;

    let mut meta_text = String::new();
    if let Ok(mut sidecar) = archive.by_name(&manifest.sidecar_file) {
        sidecar
            .read_to_string(&mut meta_text)
            .map_err(|e| format!("Failed to read sidecar from bundle: {e}"))?;
    }

    let file_name = manifest
        .source_file
        .strip_prefix("data/")
        .unwrap_or(&manifest.source_file)
        .to_string();

    Ok(BundleOpenMeta {
        file_name,
        format: manifest.format,
        meta_text,
        includes_history: manifest.includes_history,
    })
}

pub fn load_bundle_data(zip_path: &Path) -> Result<Vec<u8>, String> {
    let file = File::open(zip_path)
        .map_err(|e| format!("Failed to open bundle {}: {e}", zip_path.display()))?;
    let mut archive = ZipArchive::new(file)
        .map_err(|e| format!("Invalid ZIP archive {}: {e}", zip_path.display()))?;
    let manifest = validate_archive_and_read_manifest(&mut archive)?;

    let mut data_entry = archive
        .by_name(&manifest.source_file)
        .map_err(|_| format!("Missing data entry '{}' in bundle", manifest.source_file))?;
    let mut buf = Vec::with_capacity(data_entry.size() as usize);
    data_entry
        .read_to_end(&mut buf)
        .map_err(|e| format!("Failed to read data from bundle: {e}"))?;
    Ok(buf)
}

/// Atomically updates `data/<name>` and/or `data/<name>.metatext.jsonc` inside an
/// existing `.metatext.zip`, preserving `manifest.json` and any `history/` entries.
pub fn update_bundle_atomic(
    zip_path: &Path,
    new_data_bytes: Option<&[u8]>,
    new_meta_text: Option<&str>,
) -> Result<(), String> {
    let src_file = File::open(zip_path)
        .map_err(|e| format!("Failed to open bundle {}: {e}", zip_path.display()))?;
    let mut archive = ZipArchive::new(src_file)
        .map_err(|e| format!("Invalid ZIP archive {}: {e}", zip_path.display()))?;
    let manifest = validate_archive_and_read_manifest(&mut archive)?;

    let mut tmp_os = zip_path.as_os_str().to_os_string();
    tmp_os.push(".tmp");
    let tmp_path = PathBuf::from(tmp_os);

    let write_res: Result<(), String> = (|| {
        let out_file = File::create(&tmp_path)
            .map_err(|e| format!("Failed to create temp bundle: {e}"))?;
        let mut zip = ZipWriter::new(out_file);
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

        let mut wrote_data = false;
        let mut wrote_meta = false;

        for i in 0..archive.len() {
            let mut entry = archive
                .by_index(i)
                .map_err(|e| format!("Failed to read entry #{i}: {e}"))?;
            let name = entry.name().to_string();
            if entry.is_dir() {
                continue;
            }
            if name == manifest.source_file {
                if let Some(bytes) = new_data_bytes {
                    zip.start_file(&name, options)
                        .map_err(|e| format!("Failed to write {name}: {e}"))?;
                    zip.write_all(bytes)
                        .map_err(|e| format!("Failed to write updated data: {e}"))?;
                    wrote_data = true;
                    continue;
                }
            }
            if name == manifest.sidecar_file {
                if let Some(meta) = new_meta_text {
                    zip.start_file(&name, options)
                        .map_err(|e| format!("Failed to write {name}: {e}"))?;
                    zip.write_all(meta.as_bytes())
                        .map_err(|e| format!("Failed to write updated sidecar: {e}"))?;
                    wrote_meta = true;
                    continue;
                }
            }
            zip.start_file(&name, options)
                .map_err(|e| format!("Failed to copy entry {name}: {e}"))?;
            io::copy(&mut entry, &mut zip)
                .map_err(|e| format!("Failed to copy entry bytes {name}: {e}"))?;
        }

        if !wrote_data {
            if let Some(bytes) = new_data_bytes {
                zip.start_file(&manifest.source_file, options)
                    .map_err(|e| format!("Failed to add data entry: {e}"))?;
                zip.write_all(bytes)
                    .map_err(|e| format!("Failed to write data bytes: {e}"))?;
            }
        }
        if !wrote_meta {
            if let Some(meta) = new_meta_text {
                zip.start_file(&manifest.sidecar_file, options)
                    .map_err(|e| format!("Failed to add sidecar entry: {e}"))?;
                zip.write_all(meta.as_bytes())
                    .map_err(|e| format!("Failed to write sidecar bytes: {e}"))?;
            }
        }

        zip.finish()
            .map_err(|e| format!("Failed to finalize updated bundle: {e}"))?;
        Ok(())
    })();

    // Ensure source file handle is dropped before renaming over it on Windows
    drop(archive);

    if let Err(err) = write_res {
        let _ = fs::remove_file(&tmp_path);
        return Err(err);
    }

    if zip_path.exists() {
        let _ = fs::remove_file(zip_path);
    }
    fs::rename(&tmp_path, zip_path)
        .map_err(|e| format!("Failed to replace bundle {}: {e}", zip_path.display()))?;
    Ok(())
}

/// Records a new Shadow Git snapshot directly inside `<zip_path>`'s `history/`
/// entry (updating `manifest.json`'s `includesHistory` to `true`) atomically,
/// without creating any external `.metatext.history` folder next to the ZIP.
pub fn save_bundle_snapshot_atomic(
    zip_path: &Path,
    message: &str,
    include_data: bool,
    meta_text: &str,
    policy: &HistoryRetentionPolicy,
) -> Result<Option<HistorySnapshotMeta>, String> {
    if !policy.enabled {
        return Ok(None);
    }

    let max_data_bytes = policy.max_data_file_size_mb.saturating_mul(1024 * 1024);
    let unique_ns = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let work_dir = std::env::temp_dir()
        .join("metatext-bundle-snapshot-work")
        .join(format!("{}-{unique_ns}", std::process::id()));
    fs::create_dir_all(&work_dir)
        .map_err(|e| format!("Failed to create temp work dir: {e}"))?;

    let result: Result<Option<HistorySnapshotMeta>, String> = (|| {
        let mut manifest: BundleManifest;
        let mut data_bytes: Option<Vec<u8>> = None;

        // 1. Read manifest, optional data bytes, and extract existing history/ into work_dir
        {
            let src_file = File::open(zip_path)
                .map_err(|e| format!("Failed to open bundle {}: {e}", zip_path.display()))?;
            let mut archive = ZipArchive::new(src_file)
                .map_err(|e| format!("Invalid ZIP archive {}: {e}", zip_path.display()))?;
            manifest = validate_archive_and_read_manifest(&mut archive)?;

            if include_data && max_data_bytes > 0 {
                if let Ok(mut data_entry) = archive.by_name(&manifest.source_file) {
                    if data_entry.size() <= max_data_bytes {
                        let mut buf = Vec::with_capacity(data_entry.size() as usize);
                        data_entry
                            .read_to_end(&mut buf)
                            .map_err(|e| format!("Failed to read bundle data: {e}"))?;
                        data_bytes = Some(buf);
                    }
                }
            }

            for i in 0..archive.len() {
                let mut entry = archive
                    .by_index(i)
                    .map_err(|e| format!("Failed to read entry #{i}: {e}"))?;
                if entry.is_dir() {
                    continue;
                }
                let name = validate_entry_path(entry.name())?;
                let Some(rel) = name.strip_prefix("history/") else {
                    continue;
                };
                if rel.is_empty() {
                    continue;
                }
                let out_path = work_dir.join(rel);
                if let Some(parent) = out_path.parent() {
                    fs::create_dir_all(parent)
                        .map_err(|e| format!("Failed to create work subdir: {e}"))?;
                }
                let mut out_file = File::create(&out_path)
                    .map_err(|e| format!("Failed to extract history file {rel}: {e}"))?;
                io::copy(&mut entry, &mut out_file)
                    .map_err(|e| format!("Failed to copy history file {rel}: {e}"))?;
            }
        }

        // 2. Append snapshot via GixHistoryRepository inside work_dir
        let repo = GixHistoryRepository::from_repo_dir(work_dir.clone());
        let saved_meta = repo.save_snapshot(message, data_bytes.as_deref(), meta_text, policy)?;
        if saved_meta.is_none() {
            return Ok(None);
        }

        // 3. Atomically rewrite ZIP with updated manifest.json + new history/
        manifest.includes_history = true;
        let mut tmp_os = zip_path.as_os_str().to_os_string();
        tmp_os.push(".snap.tmp");
        let tmp_path = PathBuf::from(tmp_os);

        let rewrite_res: Result<(), String> = (|| {
            let src_file = File::open(zip_path)
                .map_err(|e| format!("Failed to reopen bundle {}: {e}", zip_path.display()))?;
            let mut archive = ZipArchive::new(src_file)
                .map_err(|e| format!("Invalid ZIP archive {}: {e}", zip_path.display()))?;
            let out_file = File::create(&tmp_path)
                .map_err(|e| format!("Failed to create temp bundle: {e}"))?;
            let mut zip = ZipWriter::new(out_file);
            let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

            // Write updated manifest.json
            let manifest_json = serde_json::to_string_pretty(&manifest)
                .map_err(|e| format!("Failed to serialize manifest: {e}"))?;
            zip.start_file("manifest.json", options)
                .map_err(|e| format!("Failed to write manifest.json: {e}"))?;
            zip.write_all(manifest_json.as_bytes())
                .map_err(|e| format!("Failed to write manifest bytes: {e}"))?;

            // Copy all non-manifest, non-history entries verbatim
            for i in 0..archive.len() {
                let mut entry = archive
                    .by_index(i)
                    .map_err(|e| format!("Failed to read entry #{i}: {e}"))?;
                if entry.is_dir() {
                    continue;
                }
                let name = validate_entry_path(entry.name())?;
                if name == "manifest.json" || name.starts_with("history/") {
                    continue;
                }
                zip.start_file(&name, options)
                    .map_err(|e| format!("Failed to copy entry {name}: {e}"))?;
                io::copy(&mut entry, &mut zip)
                    .map_err(|e| format!("Failed to copy entry bytes {name}: {e}"))?;
            }

            // Write updated history/
            write_dir_recursive(&mut zip, &work_dir, &work_dir, "history", options)?;
            zip.finish()
                .map_err(|e| format!("Failed to finalize bundle ZIP: {e}"))?;
            Ok(())
        })();

        if let Err(err) = rewrite_res {
            let _ = fs::remove_file(&tmp_path);
            return Err(err);
        }

        if zip_path.exists() {
            let _ = fs::remove_file(zip_path);
        }
        fs::rename(&tmp_path, zip_path)
            .map_err(|e| format!("Failed to replace bundle {}: {e}", zip_path.display()))?;

        Ok(saved_meta)
    })();

    let _ = fs::remove_dir_all(&work_dir);
    result
}

fn now_iso8601_utc() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let days = secs / 86_400;
    let rem = secs % 86_400;
    let hour = rem / 3_600;
    let minute = (rem % 3_600) / 60;
    let second = rem % 60;

    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, m, d, hour, minute, second
    )
}

fn detect_format_from_name(file_name: &str) -> String {
    let lower = file_name.to_lowercase();
    if lower.ends_with(".tsv") {
        "tsv".to_string()
    } else if lower.ends_with(".jsonl") || lower.ends_with(".ndjson") {
        "jsonl".to_string()
    } else if lower.ends_with(".log") {
        "log".to_string()
    } else if lower.ends_with(".txt") {
        "text".to_string()
    } else {
        "csv".to_string()
    }
}

fn write_dir_recursive(
    zip: &mut ZipWriter<File>,
    root_dir: &Path,
    current_dir: &Path,
    zip_prefix: &str,
    options: SimpleFileOptions,
) -> Result<(), String> {
    let entries = fs::read_dir(current_dir)
        .map_err(|e| format!("Failed to read history dir {}: {e}", current_dir.display()))?;
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(meta) = entry.metadata() else {
            continue;
        };
        if meta.is_dir() {
            write_dir_recursive(zip, root_dir, &path, zip_prefix, options)?;
        } else if meta.is_file() {
            let rel = path
                .strip_prefix(root_dir)
                .map_err(|e| format!("Failed to compute relative path: {e}"))?;
            let rel_posix = rel.to_string_lossy().replace('\\', "/");
            let entry_name = format!("{zip_prefix}/{rel_posix}");
            zip.start_file(&entry_name, options)
                .map_err(|e| format!("Failed to start zip entry {entry_name}: {e}"))?;
            let mut src = File::open(&path)
                .map_err(|e| format!("Failed to open history file {}: {e}", path.display()))?;
            io::copy(&mut src, zip)
                .map_err(|e| format!("Failed to write zip entry {entry_name}: {e}"))?;
        }
    }
    Ok(())
}

fn adjacent_sidecar_path(source_file: &Path) -> PathBuf {
    let mut os = source_file.as_os_str().to_os_string();
    os.push(".metatext.jsonc");
    PathBuf::from(os)
}

pub fn export_metatext_bundle(
    source_file: &Path,
    dest_zip: &Path,
    include_history: bool,
    explicit_format: Option<&str>,
) -> Result<BundleExportResult, String> {
    if !source_file.is_file() {
        return Err(format!("Source file does not exist: {}", source_file.display()));
    }
    let file_name = source_file
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .filter(|n| !n.is_empty())
        .ok_or_else(|| "Invalid source file name".to_string())?;

    let history_dir = adjacent_history_dir(source_file);
    let actual_include_history = include_history && history_dir.is_dir();

    let format = explicit_format
        .filter(|f| !f.trim().is_empty())
        .map(|f| f.to_string())
        .unwrap_or_else(|| detect_format_from_name(&file_name));

    let manifest = BundleManifest {
        bundle_version: "0.1".to_string(),
        format,
        source_file: format!("data/{file_name}"),
        sidecar_file: format!("data/{file_name}.metatext.jsonc"),
        includes_history: actual_include_history,
        created_at: now_iso8601_utc(),
        created_by: format!("MetaText Editor v{}", env!("CARGO_PKG_VERSION")),
    };

    if let Some(parent) = dest_zip.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create destination folder: {e}"))?;
        }
    }

    // Write atomically via `.tmp` sibling and rename
    let mut tmp_os = dest_zip.as_os_str().to_os_string();
    tmp_os.push(".tmp");
    let tmp_path = PathBuf::from(tmp_os);

    let write_res: Result<(), String> = (|| {
        let out_file = File::create(&tmp_path)
            .map_err(|e| format!("Failed to create temp bundle {}: {e}", tmp_path.display()))?;
        let mut zip = ZipWriter::new(out_file);
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

        // 1. manifest.json
        let manifest_json = serde_json::to_string_pretty(&manifest)
            .map_err(|e| format!("Failed to serialize manifest: {e}"))?;
        zip.start_file("manifest.json", options)
            .map_err(|e| format!("Failed to write manifest.json: {e}"))?;
        zip.write_all(manifest_json.as_bytes())
            .map_err(|e| format!("Failed to write manifest bytes: {e}"))?;

        // 2. data/<filename> (streamed from disk)
        zip.start_file(&manifest.source_file, options)
            .map_err(|e| format!("Failed to start {}: {e}", manifest.source_file))?;
        {
            let mut src = File::open(source_file)
                .map_err(|e| format!("Failed to open source file: {e}"))?;
            io::copy(&mut src, &mut zip)
                .map_err(|e| format!("Failed to copy source file into bundle: {e}"))?;
        }

        // 3. data/<filename>.metatext.jsonc
        zip.start_file(&manifest.sidecar_file, options)
            .map_err(|e| format!("Failed to start {}: {e}", manifest.sidecar_file))?;
        let sidecar_path = adjacent_sidecar_path(source_file);
        if sidecar_path.is_file() {
            let mut meta_file = File::open(&sidecar_path)
                .map_err(|e| format!("Failed to open sidecar file: {e}"))?;
            io::copy(&mut meta_file, &mut zip)
                .map_err(|e| format!("Failed to copy sidecar into bundle: {e}"))?;
        } else {
            zip.write_all(b"{\n  \"version\": \"1\"\n}\n")
                .map_err(|e| format!("Failed to write default sidecar: {e}"))?;
        }

        // 4. Optional history/
        if actual_include_history {
            write_dir_recursive(&mut zip, &history_dir, &history_dir, "history", options)?;
        }

        zip.finish()
            .map_err(|e| format!("Failed to finalize bundle ZIP: {e}"))?;
        Ok(())
    })();

    if let Err(err) = write_res {
        let _ = fs::remove_file(&tmp_path);
        return Err(err);
    }

    if dest_zip.exists() {
        let _ = fs::remove_file(dest_zip);
    }
    fs::rename(&tmp_path, dest_zip)
        .map_err(|e| format!("Failed to finalize bundle at {}: {e}", dest_zip.display()))?;

    let zip_bytes = fs::metadata(dest_zip).map(|m| m.len()).unwrap_or(0);
    Ok(BundleExportResult {
        dest_path: dest_zip.to_string_lossy().to_string(),
        zip_bytes,
        includes_history: actual_include_history,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::history::{GixHistoryRepository, HistoryRetentionPolicy};
    use std::io::Read;
    use tempfile::TempDir;
    use zip::ZipArchive;

    #[test]
    fn export_bundle_with_and_without_history() {
        let tmp = TempDir::new().unwrap();
        let csv_path = tmp.path().join("report.csv");
        let meta_path = tmp.path().join("report.csv.metatext.jsonc");
        let csv_body = b"id,value\r\n1,hello\r\n2,world\r\n";
        let meta_body = "{\n  \"version\": \"1\",\n  \"table\": { \"fontSize\": 14 }\n}\n";
        fs::write(&csv_path, csv_body).unwrap();
        fs::write(&meta_path, meta_body).unwrap();

        // Create a Shadow Git snapshot
        let repo = GixHistoryRepository::for_file(&csv_path);
        repo.save_snapshot_from_file(
            &csv_path,
            "v1",
            true,
            meta_body,
            &HistoryRetentionPolicy::default(),
        )
        .unwrap();

        // 1. Export WITHOUT history (default)
        let zip_no_hist = tmp.path().join("report.csv.metatext.zip");
        let res1 = export_metatext_bundle(&csv_path, &zip_no_hist, false, Some("csv")).unwrap();
        assert!(!res1.includes_history);
        assert!(res1.zip_bytes > 0);
        {
            let mut archive = ZipArchive::new(File::open(&zip_no_hist).unwrap()).unwrap();
            let mut manifest_str = String::new();
            archive
                .by_name("manifest.json")
                .unwrap()
                .read_to_string(&mut manifest_str)
                .unwrap();
            let manifest: BundleManifest = serde_json::from_str(&manifest_str).unwrap();
            assert_eq!(manifest.bundle_version, "0.1");
            assert_eq!(manifest.source_file, "data/report.csv");
            assert!(!manifest.includes_history);

            let mut data_out = Vec::new();
            archive
                .by_name("data/report.csv")
                .unwrap()
                .read_to_end(&mut data_out)
                .unwrap();
            assert_eq!(data_out.as_slice(), csv_body);
            assert!(archive.by_name("history/HEAD").is_err());
        }

        // 2. Export WITH history
        let zip_with_hist = tmp.path().join("report_full.csv.metatext.zip");
        let res2 = export_metatext_bundle(&csv_path, &zip_with_hist, true, Some("csv")).unwrap();
        assert!(res2.includes_history);
        {
            let mut archive = ZipArchive::new(File::open(&zip_with_hist).unwrap()).unwrap();
            assert!(archive.by_name("history/HEAD").is_ok());
            assert!(archive.by_name("history/refs/heads/main").is_ok());
        }

        // 3. Direct open, edit, and atomic save preserves history/
        let opened_meta = load_bundle_meta(&zip_with_hist).unwrap();
        assert_eq!(opened_meta.file_name, "report.csv");
        assert!(opened_meta.includes_history);
        assert_eq!(opened_meta.meta_text, meta_body);
        assert_eq!(load_bundle_data(&zip_with_hist).unwrap().as_slice(), csv_body);

        let updated_csv = b"id,value\r\n1,UPDATED\r\n2,world\r\n";
        let updated_meta = "{\n  \"version\": \"1\",\n  \"table\": { \"fontSize\": 16 }\n}\n";
        update_bundle_atomic(&zip_with_hist, Some(updated_csv), None).unwrap();
        update_bundle_atomic(&zip_with_hist, None, Some(updated_meta)).unwrap();

        assert_eq!(load_bundle_data(&zip_with_hist).unwrap().as_slice(), updated_csv);
        assert_eq!(load_bundle_meta(&zip_with_hist).unwrap().meta_text, updated_meta);
        {
            let mut archive = ZipArchive::new(File::open(&zip_with_hist).unwrap()).unwrap();
            assert!(archive.by_name("history/HEAD").is_ok());
        }

        // 4. Append new snapshot directly inside the ZIP's history/
        let appended = save_bundle_snapshot_atomic(
            &zip_with_hist,
            "v2 inside zip",
            true,
            updated_meta,
            &HistoryRetentionPolicy::default(),
        )
        .unwrap()
        .expect("appended snapshot");
        assert!(appended.includes_data);
        let extracted_hist = extract_bundle_history_to_temp(&zip_with_hist)
            .unwrap()
            .expect("extracted history");
        let list = GixHistoryRepository::from_repo_dir(extracted_hist)
            .list_snapshots(None)
            .unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].message, "v2 inside zip");
    }
}
