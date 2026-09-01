use crate::archive::util::io_path;
use crate::db::{self, Db};
use crate::error::AppError;
use crate::models::{FileEntry, RegisterOutcome, RegisterProgress, SkippedPath};
use rusqlite::{params, Connection};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, State};

const MAX_WALK_DEPTH: usize = 32;

fn row_entry(r: &rusqlite::Row) -> rusqlite::Result<FileEntry> {
    Ok(FileEntry {
        id: r.get(0)?,
        project_id: r.get(1)?,
        node_id: r.get(2)?,
        original_path: r.get(3)?,
        file_name: r.get(4)?,
        size_bytes: r.get(5)?,
        registered_at: r.get(6)?,
        validity: r.get(7)?,
        archive_status: r.get(8)?,
        last_archive_batch_id: r.get(9)?,
    })
}

/// 递归收集文件夹内全部文件（记录不可读子项到 skipped）。
fn walk_dir(dir: &Path, files: &mut Vec<(PathBuf, u64)>, skipped: &mut Vec<SkippedPath>, depth: usize) {
    if depth > MAX_WALK_DEPTH {
        skipped.push(SkippedPath {
            path: dir.to_string_lossy().to_string(),
            reason: "文件夹嵌套过深，已停止展开".into(),
        });
        return;
    }
    let rd = match fs::read_dir(dir) {
        Ok(rd) => rd,
        Err(_) => {
            skipped.push(SkippedPath {
                path: dir.to_string_lossy().to_string(),
                reason: "文件夹无法读取（不存在或无权限）".into(),
            });
            return;
        }
    };
    for entry in rd.flatten() {
        let p = entry.path();
        match fs::metadata(&p) {
            Ok(md) if md.is_file() => files.push((p.clone(), md.len())),
            Ok(md) if md.is_dir() => walk_dir(&p, files, skipped, depth + 1),
            _ => skipped.push(SkippedPath {
                path: p.to_string_lossy().to_string(),
                reason: "无法识别的文件类型".into(),
            }),
        }
    }
}

/// 零拷贝登记：仅 stat 并写入登记记录，绝不复制/移动文件。
pub fn register_paths_conn(
    conn: &Connection,
    node_id: &str,
    paths: &[String],
    on_progress: &mut dyn FnMut(RegisterProgress),
) -> Result<RegisterOutcome, AppError> {
    let project_id: String = conn
        .query_row("SELECT project_id FROM nodes WHERE id=?1", params![node_id], |r| r.get(0))
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::not_found("节点"),
            other => AppError::db(other),
        })?;

    let mut files: Vec<(PathBuf, u64)> = Vec::new();
    let mut skipped: Vec<SkippedPath> = Vec::new();

    for p in paths {
        let pb = io_path(p);
        match fs::metadata(&pb) {
            Err(_) => skipped.push(SkippedPath {
                path: p.clone(),
                reason: "无法读取源位置（不存在或无权限）".into(),
            }),
            Ok(md) if md.is_file() => files.push((pb, md.len())),
            Ok(md) if md.is_dir() => {
                let before = files.len();
                walk_dir(&pb, &mut files, &mut skipped, 0);
                if files.len() == before {
                    skipped.push(SkippedPath {
                        path: p.clone(),
                        reason: "文件夹为空或无法读取".into(),
                    });
                }
            }
            Ok(_) => skipped.push(SkippedPath {
                path: p.clone(),
                reason: "既不是文件也不是文件夹".into(),
            }),
        }
    }

    let total_scanned = files.len();
    let mut entries = Vec::with_capacity(total_scanned);
    for (idx, (pb, size)) in files.iter().enumerate() {
        let id = db::new_id();
        let path_str = pb.to_string_lossy().to_string();
        let file_name = pb
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| path_str.clone());
        let now = db::now();
        conn.execute(
            "INSERT INTO file_entries (id, project_id, node_id, original_path, file_name, size_bytes, registered_at, validity, archive_status, last_archive_batch_id)
             VALUES (?1,?2,?3,?4,?5,?6,?7,'valid','pending',NULL)",
            params![id, project_id, node_id, path_str, file_name, *size as i64, now],
        )
        .map_err(AppError::db)?;
        entries.push(FileEntry {
            id,
            project_id: project_id.clone(),
            node_id: node_id.to_string(),
            original_path: path_str.clone(),
            file_name,
            size_bytes: *size as i64,
            registered_at: now,
            validity: "valid".into(),
            archive_status: "pending".into(),
            last_archive_batch_id: None,
        });
        if idx % 25 == 0 {
            on_progress(RegisterProgress {
                node_id: node_id.to_string(),
                scanned: idx + 1,
                current_path: path_str,
            });
        }
    }

    Ok(RegisterOutcome { entries, skipped, total_scanned })
}

// ---------- Tauri 命令 ----------

#[tauri::command]
pub async fn register_files(
    app: AppHandle,
    db: State<'_, Db>,
    node_id: String,
    paths: Vec<String>,
) -> Result<RegisterOutcome, AppError> {
    let db_path = db.path.clone();
    let handle = tauri::async_runtime::spawn_blocking(move || {
        let conn = db::open_at(Path::new(&db_path))?;
        let app2 = app.clone();
        let mut on_progress = |p: RegisterProgress| {
            let _ = app2.emit("register://progress", &p);
        };
        register_paths_conn(&conn, &node_id, &paths, &mut on_progress)
    });
    match handle.await {
        Ok(result) => result,
        Err(e) => Err(AppError::db(e)),
    }
}

#[tauri::command]
pub fn remove_entry(db: State<Db>, entry_id: String) -> Result<(), AppError> {
    let conn = db.conn.lock().map_err(|_| AppError::db("数据库连接被占用"))?;
    // 仅移除登记记录；磁盘源文件不受影响（FR-006）
    conn.execute("DELETE FROM file_entries WHERE id=?1", params![entry_id])
        .map_err(AppError::db)?;
    Ok(())
}
