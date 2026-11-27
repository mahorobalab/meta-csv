//! Shadow Git history repository backed by `gix` (gitoxide / Pure Rust).
//!
//! All `gix` API calls are isolated inside this module so future 0.x upgrades
//! touch only a single file. Each tracked document stores its bare Git history
//! in an adjacent folder `<filename>.metatext.history/` alongside the file and
//! its `.metatext.jsonc` sidecar so history moves, zips, and deletes together
//! with the document without touching any parent `.git` repository.

use gix::bstr::BString;
use gix::objs::{tree, Commit, Tree};
use gix::refs::transaction::PreviousValue;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const MAIN_REF: &str = "refs/heads/main";
const DATA_ENTRY_NAME: &str = "data";
const META_ENTRY_NAME: &str = "sidecar.metatext.jsonc";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryRetentionPolicy {
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    #[serde(default = "default_mode")]
    pub mode: String, // "count" | "sizeMb"
    #[serde(default = "default_max_count")]
    pub max_count: usize,
    #[serde(default = "default_max_total_size_mb")]
    pub max_total_size_mb: u64,
    #[serde(default = "default_max_data_file_size_mb")]
    pub max_data_file_size_mb: u64,
}

fn default_enabled() -> bool {
    true
}
fn default_mode() -> String {
    "count".to_string()
}
fn default_max_count() -> usize {
    10
}
fn default_max_total_size_mb() -> u64 {
    10
}
fn default_max_data_file_size_mb() -> u64 {
    20
}

impl Default for HistoryRetentionPolicy {
    fn default() -> Self {
        Self {
            enabled: default_enabled(),
            mode: default_mode(),
            max_count: default_max_count(),
            max_total_size_mb: default_max_total_size_mb(),
            max_data_file_size_mb: default_max_data_file_size_mb(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistorySnapshotMeta {
    pub id: String,
    pub short_id: String,
    pub timestamp: String,
    pub message: String,
    pub includes_data: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data_bytes: Option<u64>,
    pub meta_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryRestorePayload {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data_bytes: Option<Vec<u8>>,
    pub meta_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryRestoreMeta {
    pub id: String,
    pub has_data: bool,
    pub meta_text: String,
}

/// Returns the adjacent Shadow Git bare repository folder next to the document:
/// `<target_file>.metatext.history` (e.g. `spec.csv.metatext.history/`).
pub fn adjacent_history_dir(target_file: &Path) -> PathBuf {
    let mut os = target_file.as_os_str().to_os_string();
    os.push(".metatext.history");
    PathBuf::from(os)
}

fn unix_seconds_to_iso8601(secs: i64) -> String {
    // Civil date conversion from days since 1970-01-01 (Howard Hinnant algorithm)
    let clamped = secs.max(0);
    let days = clamped / 86_400;
    let rem = clamped % 86_400;
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

fn now_git_time() -> gix::date::Time {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    gix::date::Time::new(secs, 0)
}

fn make_signature(time: gix::date::Time) -> gix::actor::Signature {
    gix::actor::Signature {
        name: BString::from("MetaText Editor"),
        email: BString::from("history@metatext.local"),
        time,
    }
}

fn dir_size_bytes(path: &Path) -> u64 {
    let mut total = 0u64;
    let Ok(entries) = fs::read_dir(path) else {
        return 0;
    };
    for entry in entries.flatten() {
        let p = entry.path();
        if let Ok(meta) = entry.metadata() {
            if meta.is_file() {
                total = total.saturating_add(meta.len());
            } else if meta.is_dir() {
                total = total.saturating_add(dir_size_bytes(&p));
            }
        }
    }
    total
}

pub struct GixHistoryRepository {
    repo_dir: PathBuf,
}

impl GixHistoryRepository {
    pub fn for_file(target_file: &Path) -> Self {
        Self {
            repo_dir: adjacent_history_dir(target_file),
        }
    }

    pub fn from_repo_dir(repo_dir: PathBuf) -> Self {
        Self { repo_dir }
    }

    #[cfg(test)]
    pub fn repo_dir(&self) -> &Path {
        &self.repo_dir
    }

    fn open_or_init(&self) -> Result<gix::Repository, String> {
        if self.repo_dir.join("HEAD").exists() {
            gix::open(&self.repo_dir).map_err(|e| format!("Failed to open shadow repo: {e}"))
        } else {
            fs::create_dir_all(&self.repo_dir)
                .map_err(|e| format!("Failed to create shadow repo dir: {e}"))?;
            let repo = gix::init_bare(&self.repo_dir)
                .map_err(|e| format!("Failed to init bare shadow repo: {e}"))?;
            // Ensure HEAD points to refs/heads/main for consistency with isomorphic-git
            let _ = fs::write(self.repo_dir.join("HEAD"), "ref: refs/heads/main\n");
            // Self-ignore so any parent Git repo never shows this history folder in `git status`
            let _ = fs::write(self.repo_dir.join(".gitignore"), "*\n");
            Ok(repo)
        }
    }

    fn open_existing(&self) -> Result<Option<gix::Repository>, String> {
        if !self.repo_dir.join("HEAD").exists() {
            return Ok(None);
        }
        gix::open(&self.repo_dir)
            .map(Some)
            .map_err(|e| format!("Failed to open shadow repo: {e}"))
    }

    fn read_head_commit_id(repo: &gix::Repository) -> Option<gix::ObjectId> {
        let reference = repo.find_reference(MAIN_REF).ok()?;
        reference.try_id().map(|id| id.detach())
    }

    fn build_snapshot_meta(
        repo: &gix::Repository,
        commit_id: gix::ObjectId,
    ) -> Result<HistorySnapshotMeta, String> {
        let commit_obj = repo
            .find_commit(commit_id)
            .map_err(|e| format!("Failed to read commit {commit_id}: {e}"))?;
        let commit_ref = commit_obj
            .decode()
            .map_err(|e| format!("Failed to decode commit {commit_id}: {e}"))?;
        let secs = commit_ref
            .committer()
            .ok()
            .map(|c| c.seconds())
            .unwrap_or(0);
        let message = String::from_utf8_lossy(commit_ref.message.as_ref())
            .trim()
            .to_string();

        let tree_id = commit_ref.tree();
        let tree_obj = repo
            .find_tree(tree_id)
            .map_err(|e| format!("Failed to read tree {tree_id}: {e}"))?;
        let tree_ref = tree_obj
            .decode()
            .map_err(|e| format!("Failed to decode tree {tree_id}: {e}"))?;

        let mut data_bytes: Option<u64> = None;
        let mut meta_bytes: u64 = 0;

        for entry in &tree_ref.entries {
            let name = String::from_utf8_lossy(entry.filename.as_ref());
            if name == DATA_ENTRY_NAME {
                if let Ok(blob) = repo.find_blob(entry.oid) {
                    data_bytes = Some(blob.data.len() as u64);
                }
            } else if name == META_ENTRY_NAME {
                if let Ok(blob) = repo.find_blob(entry.oid) {
                    meta_bytes = blob.data.len() as u64;
                }
            }
        }

        let id_hex = commit_id.to_hex().to_string();
        let short_id = id_hex.chars().take(7).collect();
        Ok(HistorySnapshotMeta {
            id: id_hex,
            short_id,
            timestamp: unix_seconds_to_iso8601(secs),
            message,
            includes_data: data_bytes.is_some(),
            data_bytes,
            meta_bytes,
        })
    }

    /// Fast-path snapshot save for Desktop: reads the just-saved file directly
    /// from disk (OS page cache) instead of round-tripping multi-MB byte arrays
    /// through JSON IPC.
    pub fn save_snapshot_from_file(
        &self,
        target_file: &Path,
        message: &str,
        include_data: bool,
        meta_text: &str,
        policy: &HistoryRetentionPolicy,
    ) -> Result<Option<HistorySnapshotMeta>, String> {
        if !policy.enabled {
            return Ok(None);
        }
        let max_data_bytes = policy.max_data_file_size_mb.saturating_mul(1024 * 1024);
        let disk_bytes: Option<Vec<u8>> = if include_data && max_data_bytes > 0 {
            match fs::metadata(target_file) {
                Ok(meta) if meta.len() <= max_data_bytes => {
                    Some(fs::read(target_file).map_err(|e| format!("Failed to read saved file for snapshot: {e}"))?)
                }
                _ => None,
            }
        } else {
            None
        };
        self.save_snapshot(message, disk_bytes.as_deref(), meta_text, policy)
    }

    pub fn save_snapshot(
        &self,
        message: &str,
        data_bytes: Option<&[u8]>,
        meta_text: &str,
        policy: &HistoryRetentionPolicy,
    ) -> Result<Option<HistorySnapshotMeta>, String> {
        if !policy.enabled {
            return Ok(None);
        }

        let repo = self.open_or_init()?;
        let max_data_bytes = policy.max_data_file_size_mb.saturating_mul(1024 * 1024);
        let effective_data = data_bytes.filter(|b| (b.len() as u64) <= max_data_bytes);

        let meta_blob_id = repo
            .write_blob(meta_text.as_bytes())
            .map_err(|e| format!("Failed to write meta blob: {e}"))?
            .detach();

        let mut entries: Vec<tree::Entry> = Vec::with_capacity(2);
        if let Some(bytes) = effective_data {
            let data_blob_id = repo
                .write_blob(bytes)
                .map_err(|e| format!("Failed to write data blob: {e}"))?
                .detach();
            entries.push(tree::Entry {
                mode: tree::EntryKind::Blob.into(),
                filename: BString::from(DATA_ENTRY_NAME),
                oid: data_blob_id,
            });
        }
        entries.push(tree::Entry {
            mode: tree::EntryKind::Blob.into(),
            filename: BString::from(META_ENTRY_NAME),
            oid: meta_blob_id,
        });
        // Git trees require entries sorted by filename byte order ('data' < 'sidecar.metatext.jsonc')
        entries.sort_by(|a, b| a.filename.cmp(&b.filename));

        let tree_id = repo
            .write_object(Tree { entries })
            .map_err(|e| format!("Failed to write tree: {e}"))?
            .detach();

        let parent = Self::read_head_commit_id(&repo);
        let parents = parent.into_iter().collect();
        let sig = make_signature(now_git_time());
        let commit_msg = if message.trim().is_empty() {
            "Snapshot".to_string()
        } else {
            message.trim().to_string()
        };

        let commit = Commit {
            tree: tree_id,
            parents,
            author: sig.clone(),
            committer: sig,
            encoding: None,
            message: BString::from(commit_msg),
            extra_headers: vec![],
        };

        let commit_id = repo
            .write_object(commit)
            .map_err(|e| format!("Failed to write commit: {e}"))?
            .detach();

        repo.reference(
            MAIN_REF,
            commit_id,
            PreviousValue::Any,
            "metatext snapshot",
        )
        .map_err(|e| format!("Failed to update {MAIN_REF}: {e}"))?;

        let final_head_id = self.prune(&repo, policy)?.unwrap_or(commit_id);
        let meta = Self::build_snapshot_meta(&repo, final_head_id)?;
        Ok(Some(meta))
    }

    pub fn list_snapshots(&self, limit: Option<usize>) -> Result<Vec<HistorySnapshotMeta>, String> {
        let Some(repo) = self.open_existing()? else {
            return Ok(Vec::new());
        };
        let Some(mut current) = Self::read_head_commit_id(&repo) else {
            return Ok(Vec::new());
        };

        let max_items = limit.unwrap_or(100);
        let mut results = Vec::new();
        while results.len() < max_items {
            results.push(Self::build_snapshot_meta(&repo, current)?);
            let commit_obj = repo
                .find_commit(current)
                .map_err(|e| format!("Failed to read commit {current}: {e}"))?;
            let commit_ref = commit_obj
                .decode()
                .map_err(|e| format!("Failed to decode commit {current}: {e}"))?;
            let next_parent = commit_ref.parents().next();
            match next_parent {
                Some(parent_id) => current = parent_id,
                None => break,
            }
        }
        Ok(results)
    }

    pub fn restore_snapshot(&self, id: &str) -> Result<HistoryRestorePayload, String> {
        let Some(repo) = self.open_existing()? else {
            return Err("No history repository exists for this file".to_string());
        };
        let commit_id = gix::ObjectId::from_hex(id.as_bytes())
            .map_err(|e| format!("Invalid snapshot id '{id}': {e}"))?;
        let commit_obj = repo
            .find_commit(commit_id)
            .map_err(|e| format!("Snapshot '{id}' not found: {e}"))?;
        let tree_id = commit_obj
            .tree_id()
            .map_err(|e| format!("Failed to resolve tree for '{id}': {e}"))?
            .detach();
        let tree_obj = repo
            .find_tree(tree_id)
            .map_err(|e| format!("Failed to read tree {tree_id}: {e}"))?;
        let tree_ref = tree_obj
            .decode()
            .map_err(|e| format!("Failed to decode tree {tree_id}: {e}"))?;

        let mut data_bytes: Option<Vec<u8>> = None;
        let mut meta_text = String::new();

        for entry in &tree_ref.entries {
            let name = String::from_utf8_lossy(entry.filename.as_ref());
            if name == DATA_ENTRY_NAME {
                let blob = repo
                    .find_blob(entry.oid)
                    .map_err(|e| format!("Failed to read data blob: {e}"))?;
                data_bytes = Some(blob.data.clone());
            } else if name == META_ENTRY_NAME {
                let blob = repo
                    .find_blob(entry.oid)
                    .map_err(|e| format!("Failed to read meta blob: {e}"))?;
                meta_text = String::from_utf8_lossy(&blob.data).to_string();
            }
        }

        Ok(HistoryRestorePayload {
            id: commit_id.to_hex().to_string(),
            data_bytes,
            meta_text,
        })
    }

    pub fn restore_snapshot_meta(&self, id: &str) -> Result<HistoryRestoreMeta, String> {
        let Some(repo) = self.open_existing()? else {
            return Err("No history repository exists for this file".to_string());
        };
        let commit_id = gix::ObjectId::from_hex(id.as_bytes())
            .map_err(|e| format!("Invalid snapshot id '{id}': {e}"))?;
        let commit_obj = repo
            .find_commit(commit_id)
            .map_err(|e| format!("Snapshot '{id}' not found: {e}"))?;
        let tree_id = commit_obj
            .tree_id()
            .map_err(|e| format!("Failed to resolve tree for '{id}': {e}"))?
            .detach();
        let tree_obj = repo
            .find_tree(tree_id)
            .map_err(|e| format!("Failed to read tree {tree_id}: {e}"))?;
        let tree_ref = tree_obj
            .decode()
            .map_err(|e| format!("Failed to decode tree {tree_id}: {e}"))?;

        let mut has_data = false;
        let mut meta_text = String::new();
        for entry in &tree_ref.entries {
            let name = String::from_utf8_lossy(entry.filename.as_ref());
            if name == DATA_ENTRY_NAME {
                has_data = true;
            } else if name == META_ENTRY_NAME {
                let blob = repo
                    .find_blob(entry.oid)
                    .map_err(|e| format!("Failed to read meta blob: {e}"))?;
                meta_text = String::from_utf8_lossy(&blob.data).to_string();
            }
        }
        Ok(HistoryRestoreMeta {
            id: commit_id.to_hex().to_string(),
            has_data,
            meta_text,
        })
    }

    pub fn restore_snapshot_data(&self, id: &str) -> Result<Vec<u8>, String> {
        let payload = self.restore_snapshot(id)?;
        Ok(payload.data_bytes.unwrap_or_default())
    }

    pub fn storage_usage_bytes(&self) -> u64 {
        if !self.repo_dir.exists() {
            return 0;
        }
        dir_size_bytes(&self.repo_dir)
    }

    pub fn clear(&self) -> Result<(), String> {
        if self.repo_dir.exists() {
            fs::remove_dir_all(&self.repo_dir)
                .map_err(|e| format!("Failed to clear history: {e}"))?;
        }
        Ok(())
    }

    /// Walks the commit chain from HEAD (newest -> oldest).
    fn collect_commit_chain(repo: &gix::Repository) -> Result<Vec<gix::ObjectId>, String> {
        let mut chain = Vec::new();
        let Some(mut cur) = Self::read_head_commit_id(repo) else {
            return Ok(chain);
        };
        while chain.len() < 10_000 {
            chain.push(cur);
            let commit = repo
                .find_commit(cur)
                .map_err(|e| format!("Failed to walk commit {cur}: {e}"))?;
            let decoded = commit
                .decode()
                .map_err(|e| format!("Failed to decode commit {cur}: {e}"))?;
            let next_parent = decoded.parents().next();
            match next_parent {
                Some(p) => cur = p,
                None => break,
            }
        }
        Ok(chain)
    }

    /// Rewrites the newest `keep_count` commits as a self-contained root-truncated
    /// chain and deletes unreachable loose objects so disk usage stays bounded.
    fn truncate_chain_and_gc(
        &self,
        repo: &gix::Repository,
        chain_newest_first: &[gix::ObjectId],
        keep_count: usize,
    ) -> Result<gix::ObjectId, String> {
        let keep = keep_count.max(1).min(chain_newest_first.len());
        let kept_newest_first = &chain_newest_first[..keep];

        // Rebuild from oldest kept -> newest kept so oldest kept has 0 parents
        let mut new_parent: Option<gix::ObjectId> = None;
        let mut new_head = kept_newest_first[0];
        let mut reachable: HashSet<String> = HashSet::new();

        for &old_id in kept_newest_first.iter().rev() {
            let commit_obj = repo
                .find_commit(old_id)
                .map_err(|e| format!("Failed to read commit {old_id} during prune: {e}"))?;
            let decoded = commit_obj
                .decode()
                .map_err(|e| format!("Failed to decode commit {old_id} during prune: {e}"))?;
            let tree_id = decoded.tree();

            // Mark tree & its blobs reachable
            reachable.insert(tree_id.to_hex().to_string());
            if let Ok(tree_obj) = repo.find_tree(tree_id) {
                if let Ok(tree_ref) = tree_obj.decode() {
                    for entry in &tree_ref.entries {
                        reachable.insert(entry.oid.to_hex().to_string());
                    }
                }
            }

            let author = decoded
                .author()
                .ok()
                .and_then(|a| a.to_owned().ok())
                .unwrap_or_else(|| make_signature(now_git_time()));
            let committer = decoded
                .committer()
                .ok()
                .and_then(|c| c.to_owned().ok())
                .unwrap_or_else(|| author.clone());

            let rewritten = Commit {
                tree: tree_id,
                parents: new_parent.into_iter().collect(),
                author,
                committer,
                encoding: decoded.encoding.map(|e| e.to_owned()),
                message: decoded.message.to_owned(),
                extra_headers: vec![],
            };
            let next_id = repo
                .write_object(rewritten)
                .map_err(|e| format!("Failed to rewrite commit during prune: {e}"))?
                .detach();
            reachable.insert(next_id.to_hex().to_string());
            new_parent = Some(next_id);
            new_head = next_id;
        }

        repo.reference(
            MAIN_REF,
            new_head,
            PreviousValue::Any,
            "metatext history prune",
        )
        .map_err(|e| format!("Failed to update {MAIN_REF} after prune: {e}"))?;

        self.sweep_unreachable_loose_objects(&reachable);
        Ok(new_head)
    }

    fn sweep_unreachable_loose_objects(&self, reachable_hex: &HashSet<String>) {
        let objects_dir = self.repo_dir.join("objects");
        let Ok(fanout_dirs) = fs::read_dir(&objects_dir) else {
            return;
        };
        for fanout in fanout_dirs.flatten() {
            let name = fanout.file_name().to_string_lossy().to_string();
            if name.len() != 2 || !name.chars().all(|c| c.is_ascii_hexdigit()) {
                continue;
            }
            let fanout_path = fanout.path();
            if let Ok(objs) = fs::read_dir(&fanout_path) {
                for obj in objs.flatten() {
                    let rest = obj.file_name().to_string_lossy().to_string();
                    let full_hex = format!("{name}{rest}");
                    if !reachable_hex.contains(&full_hex) {
                        let _ = fs::remove_file(obj.path());
                    }
                }
            }
            // Remove empty fanout subdir
            if fs::read_dir(&fanout_path)
                .map(|mut d| d.next().is_none())
                .unwrap_or(false)
            {
                let _ = fs::remove_dir(&fanout_path);
            }
        }
    }

    fn prune(
        &self,
        repo: &gix::Repository,
        policy: &HistoryRetentionPolicy,
    ) -> Result<Option<gix::ObjectId>, String> {
        let chain = Self::collect_commit_chain(repo)?;
        if chain.len() <= 1 {
            return Ok(None);
        }

        if policy.mode == "sizeMb" {
            let max_bytes = policy.max_total_size_mb.max(1).saturating_mul(1024 * 1024);
            if self.storage_usage_bytes() <= max_bytes {
                return Ok(None);
            }
            let mut keep = chain.len() - 1;
            let mut latest_head = chain[0];
            while keep >= 1 {
                latest_head = self.truncate_chain_and_gc(repo, &chain, keep)?;
                if self.storage_usage_bytes() <= max_bytes || keep == 1 {
                    break;
                }
                keep -= 1;
            }
            return Ok(Some(latest_head));
        }

        // Default: "count" mode
        let max_count = policy.max_count.max(1);
        if chain.len() > max_count {
            let new_head = self.truncate_chain_and_gc(repo, &chain, max_count)?;
            return Ok(Some(new_head));
        }
        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;
    use tempfile::TempDir;

    #[test]
    fn pillar1_lifecycle_roundtrip_and_disabled_policy() {
        let tmp = TempDir::new().unwrap();
        let csv_path = tmp.path().join("data.csv");
        fs::write(&csv_path, b"id,name\n1,Alice\n").unwrap();

        let repo = GixHistoryRepository::for_file(&csv_path);
        assert_eq!(repo.repo_dir(), tmp.path().join("data.csv.metatext.history"));

        // Disabled policy should not record or create repo
        let disabled = HistoryRetentionPolicy {
            enabled: false,
            ..Default::default()
        };
        let skipped = repo
            .save_snapshot("ignored", Some(b"a,b\n1,2\n"), "{}", &disabled)
            .unwrap();
        assert!(skipped.is_none());
        assert!(!repo.repo_dir().exists());

        // v1 snapshot via disk fast-path
        let policy = HistoryRetentionPolicy::default();
        let v1_data = b"id,name\n1,Alice\n2,Bob\n";
        fs::write(&csv_path, v1_data).unwrap();
        let v1_meta = r#"{"version":"1","view":{"markers":[{"row":0,"color":"amber"}]}}"#;
        let s1 = repo
            .save_snapshot_from_file(&csv_path, "Initial save", true, v1_meta, &policy)
            .unwrap()
            .expect("v1 meta");
        assert!(s1.includes_data);
        assert_eq!(s1.short_id.len(), 7);

        // v2 snapshot
        let v2_data = b"id,name\n1,Alice\n2,Bobby\n3,Carol\n";
        fs::write(&csv_path, v2_data).unwrap();
        let v2_meta = r#"{"version":"1","cells":{"1:name":{"bold":true}}}"#;
        let s2 = repo
            .save_snapshot_from_file(&csv_path, "Edited Bob", true, v2_meta, &policy)
            .unwrap()
            .expect("v2 meta");
        assert_ne!(s1.id, s2.id);

        // List returns 2 snapshots (newest first)
        let list = repo.list_snapshots(None).unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].id, s2.id);
        assert_eq!(list[1].id, s1.id);

        // Restore v1 matches byte-for-byte via meta + raw binary data helpers
        let restored_meta = repo.restore_snapshot_meta(&s1.id).unwrap();
        assert!(restored_meta.has_data);
        assert_eq!(restored_meta.meta_text, v1_meta);
        let restored_bytes = repo.restore_snapshot_data(&s1.id).unwrap();
        assert_eq!(restored_bytes.as_slice(), v1_data.as_slice());
    }

    #[test]
    fn pillar2_non_interference_with_existing_workspace_git() {
        let tmp = TempDir::new().unwrap();
        let work_dir = tmp.path().join("workspace");
        fs::create_dir_all(&work_dir).unwrap();

        let git_ok = Command::new("git")
            .args(["init"])
            .current_dir(&work_dir)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        if !git_ok {
            // Skip only if git binary is not available on PATH
            return;
        }
        let _ = Command::new("git")
            .args(["config", "user.email", "test@example.com"])
            .current_dir(&work_dir)
            .output();
        let _ = Command::new("git")
            .args(["config", "user.name", "Tester"])
            .current_dir(&work_dir)
            .output();

        let csv_path = work_dir.join("spec.csv");
        fs::write(&csv_path, b"k,v\n1,a\n").unwrap();
        let _ = Command::new("git")
            .args(["add", "spec.csv"])
            .current_dir(&work_dir)
            .output();
        let _ = Command::new("git")
            .args(["commit", "-m", "initial"])
            .current_dir(&work_dir)
            .output();

        let head_before = String::from_utf8_lossy(
            &Command::new("git")
                .args(["rev-parse", "HEAD"])
                .current_dir(&work_dir)
                .output()
                .unwrap()
                .stdout,
        )
        .trim()
        .to_string();

        // Perform adjacent Shadow Git snapshots and restore
        let repo = GixHistoryRepository::for_file(&csv_path);
        let policy = HistoryRetentionPolicy::default();
        let s1 = repo
            .save_snapshot("v1", Some(b"k,v\n1,a\n"), "{}", &policy)
            .unwrap()
            .unwrap();
        let _s2 = repo
            .save_snapshot("v2", Some(b"k,v\n1,b\n"), "{\"v\":2}", &policy)
            .unwrap()
            .unwrap();
        let _restored = repo.restore_snapshot(&s1.id).unwrap();

        // Workspace .git HEAD and git status (with *.metatext.history/ ignored) remain untouched
        let head_after = String::from_utf8_lossy(
            &Command::new("git")
                .args(["rev-parse", "HEAD"])
                .current_dir(&work_dir)
                .output()
                .unwrap()
                .stdout,
        )
        .trim()
        .to_string();
        let status_after = String::from_utf8_lossy(
            &Command::new("git")
                .args(["status", "--porcelain"])
                .current_dir(&work_dir)
                .output()
                .unwrap()
                .stdout,
        )
        .trim()
        .to_string();

        assert_eq!(head_before, head_after);
        assert!(status_after.is_empty());
    }

    #[test]
    fn pillar3_thresholds_pruning_japanese_path_and_crlf() {
        let tmp = TempDir::new().unwrap();
        let jp_path = tmp.path().join("日本語_テストデータ.csv");
        let crlf_bytes = "列1,列2\r\nあいう,えお\r\nかきく,けこ\n".as_bytes();
        fs::write(&jp_path, crlf_bytes).unwrap();

        let repo = GixHistoryRepository::for_file(&jp_path);

        // 1. Data threshold skip (maxDataFileSizeMb = 0 -> skips data, saves meta only)
        let skip_data_policy = HistoryRetentionPolicy {
            enabled: true,
            mode: "count".to_string(),
            max_count: 10,
            max_total_size_mb: 10,
            max_data_file_size_mb: 0,
        };
        let meta_only = repo
            .save_snapshot("large file", Some(crlf_bytes), "{\"big\":true}", &skip_data_policy)
            .unwrap()
            .unwrap();
        assert!(!meta_only.includes_data);
        assert!(meta_only.data_bytes.is_none());
        let restored_meta_only = repo.restore_snapshot(&meta_only.id).unwrap();
        assert!(restored_meta_only.data_bytes.is_none());
        assert_eq!(restored_meta_only.meta_text, "{\"big\":true}");

        // 2. Count pruning (maxCount = 3, save 5 snapshots -> only newest 3 remain)
        let count_policy = HistoryRetentionPolicy {
            enabled: true,
            mode: "count".to_string(),
            max_count: 3,
            max_total_size_mb: 10,
            max_data_file_size_mb: 20,
        };
        for i in 1..=5 {
            let body = format!("列1,列2\r\nval{i},日本語\r\n");
            let meta = format!("{{\"step\":{i}}}");
            repo.save_snapshot(&format!("step {i}"), Some(body.as_bytes()), &meta, &count_policy)
                .unwrap();
        }

        let list = repo.list_snapshots(None).unwrap();
        assert_eq!(list.len(), 3);
        assert_eq!(list[0].message, "step 5");
        assert_eq!(list[1].message, "step 4");
        assert_eq!(list[2].message, "step 3");

        // Verify CRLF + Japanese bytes roundtrip intact on newest snapshot
        let restored5 = repo.restore_snapshot(&list[0].id).unwrap();
        assert_eq!(
            restored5.data_bytes.as_deref(),
            Some("列1,列2\r\nval5,日本語\r\n".as_bytes())
        );
        assert_eq!(restored5.meta_text, "{\"step\":5}");
    }

    #[test]
    fn pillar4_gix_repo_passes_standard_git_fsck_and_show() {
        let tmp = TempDir::new().unwrap();
        let csv_path = tmp.path().join("compat.csv");
        let payload = b"id,val\r\n1,hello\r\n";
        fs::write(&csv_path, payload).unwrap();

        let repo = GixHistoryRepository::for_file(&csv_path);
        let policy = HistoryRetentionPolicy::default();
        let snap = repo
            .save_snapshot_from_file(&csv_path, "compat check", true, "{\"ok\":true}", &policy)
            .unwrap()
            .unwrap();

        let git_ok = Command::new("git")
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        if !git_ok {
            return;
        }

        let fsck = Command::new("git")
            .args(["--git-dir"])
            .arg(repo.repo_dir())
            .args(["fsck", "--full"])
            .output()
            .unwrap();
        assert!(fsck.status.success(), "git fsck failed: {:?}", fsck);

        let show_data = Command::new("git")
            .args(["--git-dir"])
            .arg(repo.repo_dir())
            .args(["show", &format!("{}:data", snap.id)])
            .output()
            .unwrap();
        assert!(show_data.status.success());
        assert_eq!(show_data.stdout.as_slice(), payload);

        let show_meta = Command::new("git")
            .args(["--git-dir"])
            .arg(repo.repo_dir())
            .args(["show", &format!("{}:sidecar.metatext.jsonc", snap.id)])
            .output()
            .unwrap();
        assert!(show_meta.status.success());
        assert_eq!(String::from_utf8_lossy(&show_meta.stdout), "{\"ok\":true}");
    }
}
