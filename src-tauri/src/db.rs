use crate::error::AppError;
use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::Manager;

/// 共享数据库句柄：主连接供同步命令使用；长任务（归档引擎、登记）
/// 通过 `path` 自行打开连接（WAL 模式支持多连接）。
pub struct Db {
    pub path: PathBuf,
    pub conn: Mutex<Connection>,
}

/// 带微秒精度的时间戳：保证同一秒内的多条记录有稳定先后顺序。
pub fn now() -> String {
    chrono::Local::now().format("%Y-%m-%dT%H:%M:%S%.6f").to_string()
}

pub fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

pub fn open_at(path: &Path) -> Result<Connection, AppError> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(AppError::io)?;
    }
    let conn = Connection::open(path).map_err(AppError::db)?;
    conn.pragma_update(None, "journal_mode", "WAL").map_err(AppError::db)?;
    conn.pragma_update(None, "foreign_keys", "ON").map_err(AppError::db)?;
    migrate(&conn)?;
    Ok(conn)
}

pub fn migrate(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            note TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS nodes (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            note TEXT,
            parent_node_id TEXT REFERENCES nodes(id),
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS file_entries (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            node_id TEXT NOT NULL REFERENCES nodes(id),
            original_path TEXT NOT NULL,
            file_name TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            registered_at TEXT NOT NULL,
            validity TEXT NOT NULL DEFAULT 'valid',
            archive_status TEXT NOT NULL DEFAULT 'pending',
            last_archive_batch_id TEXT
        );
        CREATE TABLE IF NOT EXISTS archive_batches (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            target_root TEXT NOT NULL,
            scope TEXT NOT NULL,
            total_files INTEGER NOT NULL,
            total_bytes INTEGER NOT NULL,
            status TEXT NOT NULL,
            source_disposition TEXT NOT NULL DEFAULT 'undecided',
            started_at TEXT NOT NULL,
            finished_at TEXT
        );
        CREATE TABLE IF NOT EXISTS archive_result_items (
            id TEXT PRIMARY KEY,
            batch_id TEXT NOT NULL REFERENCES archive_batches(id) ON DELETE CASCADE,
            entry_id TEXT NOT NULL,
            dest_path TEXT NOT NULL,
            outcome TEXT NOT NULL,
            detail TEXT,
            source_deleted INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_nodes_project ON nodes(project_id);
        CREATE INDEX IF NOT EXISTS idx_entries_project ON file_entries(project_id);
        CREATE INDEX IF NOT EXISTS idx_entries_node ON file_entries(node_id);
        CREATE INDEX IF NOT EXISTS idx_entries_status ON file_entries(project_id, archive_status);
        CREATE INDEX IF NOT EXISTS idx_batches_project ON archive_batches(project_id);
        -- 启动清理：上次进程中断遗留的 running 批次按已取消收口（数据可靠性）
        UPDATE archive_batches SET status='cancelled',
            finished_at=COALESCE(finished_at, strftime('%Y-%m-%dT%H:%M:%S','now','localtime'))
        WHERE status='running';
        "#,
    )
    .map_err(AppError::db)
}

pub fn init(app: &tauri::AppHandle) -> Result<(), AppError> {
    let dir = app.path().app_data_dir().map_err(|e| AppError::io(e))?;
    let path = dir.join("cfdflow.db");
    let conn = open_at(&path)?;
    app.manage(Db { path, conn: Mutex::new(conn) });
    Ok(())
}
