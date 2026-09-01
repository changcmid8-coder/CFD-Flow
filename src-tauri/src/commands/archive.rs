use crate::archive::engine::{self, BatchFinal, Plan, PlanItem, ProgressEvt};
use crate::archive::util::{disk_free, disambiguate_dir, io_path, safe_name};
use crate::db::{self, Db};
use crate::error::AppError;
use crate::models::BatchSummary;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

/// 运行中的归档批次取消标志：batch_id -> flag
pub struct ArchiveRegistry(pub Mutex<HashMap<String, Arc<AtomicBool>>>);

#[derive(Serialize)]
pub struct PreviewItem {
    pub entry_id: String,
    pub node_id: String,
    pub node_name: String,
    pub current_path: String,
    pub current_size: i64,
    pub validity: String,
    pub dest_path: String,
}

#[derive(Serialize)]
pub struct Conflict {
    pub dest_path: String,
    pub kind: String, // existing_file | batch_duplicate
}

#[derive(Serialize)]
pub struct PreviewResult {
    pub items: Vec<PreviewItem>,
    pub total_files: usize,
    pub total_bytes: i64,
    pub conflicts: Vec<Conflict>,
    pub disk_free_bytes: Option<u64>,
}

#[derive(Serialize)]
pub struct FinalizeResult {
    pub deleted: usize,
    pub failed: Vec<FailedDelete>,
}

#[derive(Serialize)]
pub struct FailedDelete {
    pub path: String,
    pub reason: String,
}

/// 归档预检：重新 stat 每个待归档源（刷新 validity）、模拟两层目录分配、
/// 检测同名文件冲突与目标磁盘可用空间。不写入任何目标文件。
pub fn preview_conn(conn: &Connection, project_id: &str, target_root: &str) -> Result<PreviewResult, AppError> {
    let project_name: String = conn
        .query_row("SELECT name FROM projects WHERE id=?1", params![project_id], |r| r.get(0))
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::not_found("工程"),
            other => AppError::db(other),
        })?;

    let root = PathBuf::from(target_root.trim());
    if root.as_os_str().is_empty() {
        return Err(AppError::validation("请指定归档目标目录"));
    }

    let mut taken: HashSet<String> = HashSet::new();
    let proj_dir = disambiguate_dir(&root, &project_name, &mut taken);

    let mut stmt = conn
        .prepare(
            "SELECT e.id, e.node_id, n.name, e.original_path, e.file_name, e.registered_at
             FROM file_entries e JOIN nodes n ON e.node_id = n.id
             WHERE e.project_id=?1 AND e.archive_status='pending'
             ORDER BY n.created_at, e.registered_at",
        )
        .map_err(AppError::db)?;
    let rows: Vec<(String, String, String, String, String, String)> = stmt
        .query_map(params![project_id], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?))
        })
        .map_err(AppError::db)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(AppError::db)?;

    let mut node_dirs: HashMap<String, PathBuf> = HashMap::new();
    let mut items = Vec::new();
    let mut conflicts = Vec::new();
    let mut seen_dest: HashSet<String> = HashSet::new();
    let mut total_bytes: i64 = 0;

    for (entry_id, node_id, node_name, original_path, file_name, _registered_at) in rows {
        // 重新 stat：刷新有效性并取当前实际大小
        let (validity, size) = match std::fs::metadata(io_path(&original_path)) {
            Ok(md) => {
                let _ = conn.execute(
                    "UPDATE file_entries SET validity='valid' WHERE id=?1",
                    params![entry_id],
                );
                ("valid".to_string(), md.len() as i64)
            }
            Err(_) => {
                let _ = conn.execute(
                    "UPDATE file_entries SET validity='missing' WHERE id=?1",
                    params![entry_id],
                );
                ("missing".to_string(), 0)
            }
        };
        total_bytes += size;

        let dir = node_dirs
            .entry(node_id.clone())
            .or_insert_with(|| disambiguate_dir(&proj_dir, &node_name, &mut taken))
            .clone();
        let dest = dir.join(safe_name(&file_name));
        let dest_str = dest.to_string_lossy().to_string();

        if std::fs::metadata(&dest).is_ok() {
            conflicts.push(Conflict { dest_path: dest_str.clone(), kind: "existing_file".into() });
        } else if !seen_dest.insert(dest_str.clone()) {
            conflicts.push(Conflict { dest_path: dest_str.clone(), kind: "batch_duplicate".into() });
        } else {
            seen_dest.remove(&dest_str);
        }
        seen_dest.insert(dest_str.clone());

        items.push(PreviewItem {
            entry_id,
            node_id,
            node_name,
            current_path: original_path,
            current_size: size,
            validity,
            dest_path: dest_str,
        });
    }

    Ok(PreviewResult {
        total_files: items.len(),
        total_bytes,
        items,
        conflicts,
        disk_free_bytes: disk_free(&root),
    })
}

fn get_plan_items(conn: &Connection, entry_ids: &[String]) -> Result<Vec<(String, String, String, String, String, String)>, AppError> {
    if entry_ids.is_empty() {
        return Ok(Vec::new());
    }
    let placeholders = entry_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT e.id, e.node_id, n.name, e.original_path, e.file_name, e.registered_at
         FROM file_entries e JOIN nodes n ON e.node_id = n.id
         WHERE e.id IN ({})
         ORDER BY n.created_at, e.registered_at",
        placeholders
    );
    let mut stmt = conn.prepare(&sql).map_err(AppError::db)?;
    let ref_ids: Vec<&dyn rusqlite::ToSql> = entry_ids.iter().map(|s| s as &dyn rusqlite::ToSql).collect();
    let rows = stmt
        .query_map(ref_ids.as_slice(), |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?))
        })
        .map_err(AppError::db)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(AppError::db)?;
    Ok(rows)
}

// ---------- Tauri 命令 ----------

#[tauri::command]
pub fn preview_archive(db: State<Db>, project_id: String, target_root: String) -> Result<PreviewResult, AppError> {
    let conn = db.conn.lock().map_err(|_| AppError::db("数据库连接被占用"))?;
    preview_conn(&conn, &project_id, &target_root)
}

#[tauri::command]
pub async fn execute_archive(
    app: AppHandle,
    db: State<'_, Db>,
    project_id: String,
    target_root: String,
    entry_ids: Vec<String>,
    conflict_policy: HashMap<String, String>,
    scope: String,
) -> Result<String, AppError> {
    let db_path = db.path.clone();
    let batch_id = db::new_id();

    // 同步快速构建计划（含重新 stat）并登记批次
    let (plan, total_bytes) = {
        let conn = db.conn.lock().map_err(|_| AppError::db("数据库连接被占用"))?;
        let project_name: String = conn
            .query_row("SELECT name FROM projects WHERE id=?1", params![project_id], |r| r.get(0))
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => AppError::not_found("工程"),
                other => AppError::db(other),
            })?;
        let rows = get_plan_items(&conn, &entry_ids)?;
        if rows.is_empty() {
            return Err(AppError::validation("没有可归档的文件"));
        }
        let mut items = Vec::with_capacity(rows.len());
        let mut total_bytes: i64 = 0;
        for (entry_id, node_id, node_name, original_path, file_name, _reg) in rows {
            let size = std::fs::metadata(io_path(&original_path)).map(|m| m.len() as i64).unwrap_or(0);
            total_bytes += size;
            items.push(PlanItem {
                entry_id,
                node_id,
                node_name,
                src: original_path,
                file_name,
                size: size.max(0) as u64,
            });
        }
        let plan = Plan {
            db_path: db_path.to_string_lossy().to_string(),
            batch_id: batch_id.clone(),
            project_name,
            target_root: target_root.trim().to_string(),
            items,
            policies: conflict_policy,
        };
        conn.execute(
            "INSERT INTO archive_batches (id, project_id, target_root, scope, total_files, total_bytes, status, source_disposition, started_at, finished_at)
             VALUES (?1,?2,?3,?4,?5,?6,'running','undecided',?7,NULL)",
            params![batch_id, project_id, plan.target_root, scope, plan.items.len() as i64, total_bytes, db::now()],
        )
        .map_err(AppError::db)?;
        (plan, total_bytes)
    };

    let flag = Arc::new(AtomicBool::new(false));
    if let Some(reg) = app.try_state::<ArchiveRegistry>() {
        reg.0.lock().map_err(|_| AppError::db("归档状态被占用"))?.insert(batch_id.clone(), flag.clone());
    }

    let app2 = app.clone();
    let emit_batch = batch_id.clone();
    let handle = tauri::async_runtime::spawn_blocking(move || {
        engine::run(plan, flag, move |evt: ProgressEvt| {
            let _ = app2.emit("archive://progress", &evt);
        })
    });

    // 转发结束事件
    let app3 = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Ok(fin) = handle.await {
            let _ = app3.emit("archive://finished", &fin);
        }
    });

    let _ = total_bytes;
    Ok(emit_batch)
}

#[tauri::command]
pub fn cancel_archive(app: AppHandle, batch_id: String) -> Result<(), AppError> {
    if let Some(reg) = app.try_state::<ArchiveRegistry>() {
        if let Some(flag) = reg.0.lock().map_err(|_| AppError::db("归档状态被占用"))?.get(&batch_id) {
            flag.store(true, std::sync::atomic::Ordering::Relaxed);
        }
    }
    Ok(())
}

/// 归档完成后的源文件处置：keep_sources=true 仅记录保留；false 删除本批次
/// 成功复制条目的源文件（前端必须先行二次确认），逐条报告失败不中断。
pub fn finalize_source_disposition_conn(conn: &Connection, batch_id: &str, keep_sources: bool) -> Result<FinalizeResult, AppError> {
    let n = conn
        .execute("UPDATE archive_batches SET source_disposition=?2 WHERE id=?1", params![batch_id, if keep_sources { "kept" } else { "deleted" }])
        .map_err(AppError::db)?;
    if n == 0 {
        return Err(AppError::not_found("归档批次"));
    }
    let mut result = FinalizeResult { deleted: 0, failed: Vec::new() };
    if keep_sources {
        return Ok(result);
    }
    let mut stmt = conn
        .prepare(
            "SELECT r.id, e.original_path FROM archive_result_items r
             JOIN file_entries e ON e.id = r.entry_id
             WHERE r.batch_id=?1 AND r.outcome='copied'",
        )
        .map_err(AppError::db)?;
    let rows: Vec<(String, String)> = stmt
        .query_map(params![batch_id], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(AppError::db)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(AppError::db)?;
    for (item_id, path) in rows {
        match std::fs::remove_file(io_path(&path)) {
            Ok(_) => {
                let _ = conn.execute("UPDATE archive_result_items SET source_deleted=1 WHERE id=?1", params![item_id]);
                result.deleted += 1;
            }
            Err(e) => {
                let (code, msg) = crate::archive::util::classify_io(&e);
                result.failed.push(FailedDelete { path, reason: format!("[{}] {}", code, msg) });
            }
        }
    }
    Ok(result)
}

#[tauri::command]
pub fn finalize_source_disposition(db: State<Db>, batch_id: String, keep_sources: bool) -> Result<FinalizeResult, AppError> {
    let conn = db.conn.lock().map_err(|_| AppError::db("数据库连接被占用"))?;
    finalize_source_disposition_conn(&conn, &batch_id, keep_sources)
}

#[tauri::command]
pub fn list_batch_results(db: State<Db>, batch_id: String) -> Result<Vec<crate::models::ArchiveResultItem>, AppError> {
    let conn = db.conn.lock().map_err(|_| AppError::db("数据库连接被占用"))?;
    let mut stmt = conn
        .prepare("SELECT id, batch_id, entry_id, dest_path, outcome, detail, source_deleted FROM archive_result_items WHERE batch_id=?1 ORDER BY dest_path")
        .map_err(AppError::db)?;
    let rows = stmt
        .query_map(params![batch_id], |r| {
            Ok(crate::models::ArchiveResultItem {
                id: r.get(0)?,
                batch_id: r.get(1)?,
                entry_id: r.get(2)?,
                dest_path: r.get(3)?,
                outcome: r.get(4)?,
                detail: r.get(5)?,
                source_deleted: r.get::<_, i64>(6)? != 0,
            })
        })
        .map_err(AppError::db)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(AppError::db)
}

// 引用 safe_name 供预检使用（文件名仅清洗目录层；文件名保持原名）

#[tauri::command]
pub fn list_archive_batches(db: State<Db>, project_id: String) -> Result<Vec<BatchSummary>, AppError> {
    let conn = db.conn.lock().map_err(|_| AppError::db("数据库连接被占用"))?;
    let mut stmt = conn
        .prepare(
            "SELECT b.id, b.project_id, b.target_root, b.scope, b.total_files, b.total_bytes, b.status, b.source_disposition, b.started_at, b.finished_at,
                (SELECT COUNT(*) FROM archive_result_items r WHERE r.batch_id=b.id AND r.outcome='copied'),
                (SELECT COUNT(*) FROM archive_result_items r WHERE r.batch_id=b.id AND r.outcome='skipped'),
                (SELECT COUNT(*) FROM archive_result_items r WHERE r.batch_id=b.id AND r.outcome='failed')
             FROM archive_batches b WHERE b.project_id=?1 ORDER BY b.started_at DESC",
        )
        .map_err(AppError::db)?;
    let rows = stmt
        .query_map(params![project_id], |r| {
            Ok(BatchSummary {
                id: r.get(0)?,
                project_id: r.get(1)?,
                target_root: r.get(2)?,
                scope: r.get(3)?,
                total_files: r.get(4)?,
                total_bytes: r.get(5)?,
                status: r.get(6)?,
                source_disposition: r.get(7)?,
                started_at: r.get(8)?,
                finished_at: r.get(9)?,
                copied: r.get(10)?,
                skipped: r.get(11)?,
                failed: r.get(12)?,
            })
        })
        .map_err(AppError::db)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(AppError::db)
}
