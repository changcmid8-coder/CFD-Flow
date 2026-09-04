use crate::archive::util::{classify_io, disambiguate_dir, io_path, safe_name, unique_file_path};
use crate::db;
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::io::{BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

/// 归档执行计划：由命令层基于最新 stat 构建；引擎不依赖 Tauri，可独立测试。
#[derive(Clone, Debug, Serialize)]
pub struct PlanItem {
    pub entry_id: String,
    pub node_id: String,
    pub node_name: String,
    pub src: String,
    pub file_name: String,
    pub size: u64,
}

#[derive(Clone, Debug, Serialize)]
pub struct Plan {
    pub db_path: String,
    pub batch_id: String,
    pub project_name: String,
    pub target_root: String,
    pub items: Vec<PlanItem>,
    /// dest_path -> skip | overwrite | rename（确认页逐条选择；未列出的冲突默认安全重命名）
    pub policies: HashMap<String, String>,
}

use std::collections::HashMap;

#[derive(Clone, Debug, Serialize)]
pub struct ProgressEvt {
    pub batch_id: String,
    pub done_files: u64,
    pub total_files: u64,
    pub done_bytes: u64,
    pub total_bytes: u64,
    pub current_file: String,
    pub phase: String, // copying | finishing
}

#[derive(Clone, Debug, Serialize)]
pub struct BatchFinal {
    pub batch_id: String,
    pub status: String, // completed | cancelled | failed
    pub copied: u64,
    pub skipped: u64,
    pub failed: u64,
    pub copied_bytes: u64,
    pub target_root: String,
}

enum CopyError {
    Cancelled,
    Io(std::io::Error),
}

struct Outcome {
    status: String,
    copied: u64,
    skipped: u64,
    failed: u64,
    copied_bytes: u64,
    /// (entry_id, dest_path) 供收尾更新登记状态
    copied_entries: Vec<(String, String)>,
}

/// 执行批次并在结束时统一落库。任何情况下不产生"看似完整实为半成品"的文件：
/// 逐文件 .part 复制 + 原子重命名；取消/失败即清理 .part。
pub fn run(plan: Plan, cancel: Arc<AtomicBool>, mut on_progress: impl FnMut(ProgressEvt)) -> BatchFinal {
    let total_files = plan.items.len() as u64;
    let total_bytes: u64 = plan.items.iter().map(|i| i.size).sum();
    let batch_id = plan.batch_id.clone();
    let db_path = plan.db_path.clone();

    let outcome = execute(&plan, &cancel, &mut on_progress, total_files, total_bytes);

    on_progress(ProgressEvt {
        batch_id: batch_id.clone(),
        done_files: outcome.copied + outcome.skipped + outcome.failed,
        total_files,
        done_bytes: outcome.copied_bytes,
        total_bytes,
        current_file: String::new(),
        phase: "finishing".into(),
    });

    if let Ok(conn) = db::open_at(Path::new(&db_path)) {
        let _ = conn.execute(
            "UPDATE archive_batches SET status=?2, finished_at=?3 WHERE id=?1",
            rusqlite::params![batch_id, outcome.status, db::now()],
        );
        for (entry_id, _dest) in &outcome.copied_entries {
            let _ = conn.execute(
                "UPDATE file_entries SET archive_status='archived', last_archive_batch_id=?2 WHERE id=?1",
                rusqlite::params![entry_id, batch_id],
            );
        }
    }

    BatchFinal {
        batch_id,
        status: outcome.status,
        copied: outcome.copied,
        skipped: outcome.skipped,
        failed: outcome.failed,
        copied_bytes: outcome.copied_bytes,
        target_root: plan.target_root.clone(),
    }
}

fn execute(
    plan: &Plan,
    cancel: &Arc<AtomicBool>,
    on_progress: &mut dyn FnMut(ProgressEvt),
    total_files: u64,
    total_bytes: u64,
) -> Outcome {
    let mut st = Outcome {
        status: "completed".into(),
        copied: 0,
        skipped: 0,
        failed: 0,
        copied_bytes: 0,
        copied_entries: Vec::new(),
    };

    let conn = match db::open_at(Path::new(&plan.db_path)) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[engine] open db failed: {:?}", e);
            st.status = "failed".into();
            st.failed = plan.items.len() as u64;
            return st;
        }
    };

    let record = |entry_id: &str, dest: &str, o: &str, detail: Option<&str>| {
        let _ = conn.execute(
            "INSERT INTO archive_result_items (id, batch_id, entry_id, dest_path, outcome, detail, source_deleted) VALUES (?1,?2,?3,?4,?5,?6,0)",
            rusqlite::params![db::new_id(), plan.batch_id, entry_id, dest, o, detail],
        );
    };

    // 工程层目录（磁盘同名自动消歧，taken_dirs 记录本批次已占用的绝对路径）
    let root = PathBuf::from(&plan.target_root);
    let mut taken_dirs: HashSet<String> = HashSet::new();
    let proj_dir = disambiguate_dir(&root, &plan.project_name, &mut taken_dirs);
    if let Err(e) = fs::create_dir_all(&proj_dir) {
        eprintln!("[engine] create_dir_all {:?} failed: {:?}", proj_dir, e);
        let (code, msg) = classify_io(&e);
        for item in &plan.items {
            let d = proj_dir.join(&item.file_name);
            record(&item.entry_id, &d.to_string_lossy(), "failed", Some(&format!("[{}] {}", code, msg)));
        }
        st.status = "failed".into();
        st.failed = plan.items.len() as u64;
        return st;
    }

    let mut current_node: Option<(String, PathBuf)> = None;
    let mut done_files: u64 = 0;
    let mut done_bytes: u64 = 0;

    for item in &plan.items {
        if cancel.load(Ordering::Relaxed) {
            st.status = "cancelled".into();
            return st;
        }

        // 节点层目录：同名节点自动消歧（磁盘已存在或本批次已占用即追加序号）
        let node_dir: PathBuf = match &current_node {
            Some((id, dir)) if id == &item.node_id => dir.clone(),
            _ => {
                let base = proj_dir.join(safe_name(&item.node_name));
                let dir = next_free_dir(&base, &mut taken_dirs);
                match fs::create_dir_all(&dir) {
                    Ok(_) => dir,
                    Err(e) => {
                        let (code, msg) = classify_io(&e);
                        let d = dir.join(&item.file_name);
                        record(&item.entry_id, &d.to_string_lossy(), "failed", Some(&format!("[{}] {}", code, msg)));
                        st.failed += 1;
                        done_files += 1;
                        continue;
                    }
                }
            }
        };
        current_node = Some((item.node_id.clone(), node_dir.clone()));

        let mut dest = node_dir.join(&item.file_name);
        let mut dest_str = dest.to_string_lossy().to_string();

        // 同名文件冲突：确认页策略优先；未列出的按安全重命名兜底（绝不静默覆盖）
        if dest.exists() {
            let policy = plan.policies.get(&dest_str).map(|s| s.as_str()).unwrap_or("rename");
            match policy {
                "skip" => {
                    record(&item.entry_id, &dest_str, "skipped", Some("目标已存在同名文件，按策略跳过"));
                    st.skipped += 1;
                    done_files += 1;
                    on_progress(evt(plan, done_files, total_files, done_bytes, total_bytes, &item.file_name));
                    continue;
                }
                "overwrite" => {
                    if let Err(e) = fs::remove_file(io_path(&dest_str)) {
                        let (code, msg) = classify_io(&e);
                        record(&item.entry_id, &dest_str, "failed", Some(&format!("[{}] {}", code, msg)));
                        st.failed += 1;
                        done_files += 1;
                        on_progress(evt(plan, done_files, total_files, done_bytes, total_bytes, &item.file_name));
                        continue;
                    }
                }
                _ => {
                    dest = unique_file_path(&node_dir, &item.file_name);
                    dest_str = dest.to_string_lossy().to_string();
                }
            }
        }

        match copy_file(io_path(&item.src), &dest, cancel, &mut |delta| {
            done_bytes += delta;
            on_progress(evt(plan, done_files, total_files, done_bytes, total_bytes, &item.file_name));
        }) {
            Ok(bytes) => {
                st.copied += 1;
                st.copied_bytes += bytes;
                st.copied_entries.push((item.entry_id.clone(), dest_str.clone()));
                record(&item.entry_id, &dest_str, "copied", None);
            }
            Err(CopyError::Cancelled) => {
                st.status = "cancelled".into();
                return st;
            }
            Err(CopyError::Io(e)) => {
                let (code, msg) = classify_io(&e);
                record(&item.entry_id, &dest_str, "failed", Some(&format!("[{}] {}", code, msg)));
                st.failed += 1;
            }
        }

        done_files += 1;
        on_progress(evt(plan, done_files, total_files, done_bytes, total_bytes, &item.file_name));
    }

    st
}

fn evt(plan: &Plan, done_files: u64, total_files: u64, done_bytes: u64, total_bytes: u64, current: &str) -> ProgressEvt {
    ProgressEvt {
        batch_id: plan.batch_id.clone(),
        done_files,
        total_files,
        done_bytes,
        total_bytes,
        current_file: current.to_string(),
        phase: "copying".into(),
    }
}

/// 节点目录消歧：仅看本批次占用（taken）——磁盘目录跨批次复用，文件级冲突走策略。
/// 首个用原名，后续按 -2、-3……追加。
fn next_free_dir(base: &Path, taken: &mut HashSet<String>) -> PathBuf {
    let base_name = base.file_name().unwrap_or_default().to_string_lossy().to_string();
    let mut idx: u32 = 0; // 0=原名，1=-2，2=-3……
    loop {
        let name = if idx == 0 { base_name.clone() } else { format!("{}-{}", base_name, idx + 1) };
        let p = base.with_file_name(name);
        let s = p.to_string_lossy().to_string();
        if !taken.contains(&s) {
            taken.insert(s);
            return p;
        }
        idx += 1;
        if idx > 9999 {
            let p = base.with_file_name(format!(
                "{}-{}",
                base_name,
                chrono::Local::now().timestamp_subsec_nanos()
            ));
            taken.insert(p.to_string_lossy().to_string());
            return p;
        }
    }
}

/// 分块复制到 .part，成功后原子重命名；分块边界与每 8MiB 检查取消标志。
fn copy_file(
    src: PathBuf,
    dest: &Path,
    cancel: &Arc<AtomicBool>,
    on_chunk: &mut dyn FnMut(u64),
) -> Result<u64, CopyError> {
    let part = PathBuf::from(format!("{}.part", dest.to_string_lossy()));
    let cleanup = |p: &Path| {
        let _ = fs::remove_file(p);
    };
    let mut reader = match std::fs::File::open(&src) {
        Ok(f) => f,
        Err(e) => return Err(CopyError::Io(e)),
    };
    let mut writer = match std::fs::File::create(&part).map(BufWriter::new) {
        Ok(w) => w,
        Err(e) => return Err(CopyError::Io(e)),
    };
    let mut buf = vec![0u8; 1024 * 1024];
    let mut total: u64 = 0;
    let mut since_check: usize = 0;
    loop {
        if cancel.load(Ordering::Relaxed) {
            drop(writer);
            cleanup(&part);
            return Err(CopyError::Cancelled);
        }
        let n = match reader.read(&mut buf) {
            Ok(n) => n,
            Err(e) => {
                drop(writer);
                cleanup(&part);
                return Err(CopyError::Io(e));
            }
        };
        if n == 0 {
            break;
        }
        if let Err(e) = writer.write_all(&buf[..n]) {
            drop(writer);
            cleanup(&part);
            return Err(CopyError::Io(e));
        }
        total += n as u64;
        since_check += n;
        on_chunk(n as u64);
        if since_check >= 8 * 1024 * 1024 {
            since_check = 0;
            if cancel.load(Ordering::Relaxed) {
                drop(writer);
                cleanup(&part);
                return Err(CopyError::Cancelled);
            }
        }
    }
    if let Err(e) = writer.flush() {
        drop(writer);
        cleanup(&part);
        return Err(CopyError::Io(e));
    }
    drop(writer);
    if let Err(e) = fs::rename(&part, dest) {
        cleanup(&part);
        return Err(CopyError::Io(e));
    }
    Ok(total)
}
