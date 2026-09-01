use crate::db::{self, Db};
use crate::error::AppError;
use crate::models::{Project, ProjectDetail, ProjectSummary};
use rusqlite::{params, Connection, Row};
use tauri::State;

fn row_project(r: &Row) -> rusqlite::Result<Project> {
    Ok(Project {
        id: r.get(0)?,
        name: r.get(1)?,
        note: r.get(2)?,
        created_at: r.get(3)?,
        updated_at: r.get(4)?,
    })
}

fn validate_name(name: &str) -> Result<(), AppError> {
    if name.trim().is_empty() {
        return Err(AppError::validation("请输入工程名称"));
    }
    if name.chars().count() > 100 {
        return Err(AppError::validation("工程名称不能超过 100 个字符"));
    }
    Ok(())
}

fn validate_note(note: &Option<String>) -> Result<(), AppError> {
    if let Some(n) = note {
        if n.chars().count() > 2000 {
            return Err(AppError::validation("备注不能超过 2000 个字符"));
        }
    }
    Ok(())
}

pub fn list_projects_conn(conn: &Connection) -> Result<Vec<ProjectSummary>, AppError> {
    let mut stmt = conn
        .prepare(
            "SELECT p.id, p.name, p.note, p.created_at, p.updated_at,
                (SELECT COUNT(*) FROM file_entries e WHERE e.project_id = p.id AND e.archive_status = 'pending')
             FROM projects p ORDER BY p.updated_at DESC",
        )
        .map_err(AppError::db)?;
    let rows = stmt
        .query_map([], |r| {
            Ok(ProjectSummary {
                id: r.get(0)?,
                name: r.get(1)?,
                note: r.get(2)?,
                created_at: r.get(3)?,
                updated_at: r.get(4)?,
                pending_count: r.get(5)?,
            })
        })
        .map_err(AppError::db)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(AppError::db)
}

pub fn create_project_conn(conn: &Connection, name: &str, note: &Option<String>) -> Result<Project, AppError> {
    validate_name(name)?;
    validate_note(note)?;
    let id = db::new_id();
    let now = db::now();
    conn.execute(
        "INSERT INTO projects (id, name, note, created_at, updated_at) VALUES (?1,?2,?3,?4,?4)",
        params![id, name.trim(), note, now],
    )
    .map_err(AppError::db)?;
    Ok(Project { id, name: name.trim().to_string(), note: note.clone(), created_at: now.clone(), updated_at: now })
}

pub fn update_project_conn(conn: &Connection, id: &str, name: &str, note: &Option<String>) -> Result<Project, AppError> {
    validate_name(name)?;
    validate_note(note)?;
    let n = conn
        .execute(
            "UPDATE projects SET name=?2, note=?3, updated_at=?4 WHERE id=?1",
            params![id, name.trim(), note, db::now()],
        )
        .map_err(AppError::db)?;
    if n == 0 {
        return Err(AppError::not_found("工程"));
    }
    Ok(conn.query_row("SELECT id,name,note,created_at,updated_at FROM projects WHERE id=?1", params![id], row_project).map_err(AppError::db)?)
}

pub fn delete_project_conn(conn: &Connection, id: &str) -> Result<(), AppError> {
    let n = conn.execute("DELETE FROM projects WHERE id=?1", params![id]).map_err(AppError::db)?;
    if n == 0 {
        return Err(AppError::not_found("工程"));
    }
    Ok(())
}

fn get_project(conn: &Connection, id: &str) -> Result<Project, AppError> {
    conn.query_row(
        "SELECT id, name, note, created_at, updated_at FROM projects WHERE id=?1",
        params![id],
        row_project,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => AppError::not_found("工程"),
        other => AppError::db(other),
    })
}

pub fn get_project_detail_conn(conn: &Connection, project_id: &str) -> Result<ProjectDetail, AppError> {
    let project = get_project(conn, project_id)?;
    let mut stmt = conn
        .prepare("SELECT id, project_id, name, note, parent_node_id, created_at FROM nodes WHERE project_id=?1 ORDER BY created_at")
        .map_err(AppError::db)?;
    let nodes = stmt
        .query_map(params![project_id], |r| {
            Ok(crate::models::Node {
                id: r.get(0)?,
                project_id: r.get(1)?,
                name: r.get(2)?,
                note: r.get(3)?,
                parent_node_id: r.get(4)?,
                created_at: r.get(5)?,
            })
        })
        .map_err(AppError::db)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(AppError::db)?;
    let mut stmt = conn
        .prepare("SELECT id, project_id, node_id, original_path, file_name, size_bytes, registered_at, validity, archive_status, last_archive_batch_id FROM file_entries WHERE project_id=?1 ORDER BY registered_at")
        .map_err(AppError::db)?;
    let entries = stmt
        .query_map(params![project_id], |r| {
            Ok(crate::models::FileEntry {
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
        })
        .map_err(AppError::db)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(AppError::db)?;
    Ok(ProjectDetail { project, nodes, entries })
}

// ---------- Tauri 命令 ----------

#[tauri::command]
pub fn list_projects(db: State<Db>) -> Result<Vec<ProjectSummary>, AppError> {
    let conn = db.conn.lock().map_err(|_| AppError::db("数据库连接被占用"))?;
    list_projects_conn(&conn)
}

#[tauri::command]
pub fn create_project(db: State<Db>, name: String, note: Option<String>) -> Result<Project, AppError> {
    let conn = db.conn.lock().map_err(|_| AppError::db("数据库连接被占用"))?;
    create_project_conn(&conn, &name, &note)
}

#[tauri::command]
pub fn update_project(db: State<Db>, id: String, name: String, note: Option<String>) -> Result<Project, AppError> {
    let conn = db.conn.lock().map_err(|_| AppError::db("数据库连接被占用"))?;
    update_project_conn(&conn, &id, &name, &note)
}

#[tauri::command]
pub fn delete_project(db: State<Db>, id: String) -> Result<(), AppError> {
    let conn = db.conn.lock().map_err(|_| AppError::db("数据库连接被占用"))?;
    delete_project_conn(&conn, &id)
}

#[tauri::command]
pub fn get_project_detail(db: State<Db>, project_id: String) -> Result<ProjectDetail, AppError> {
    let conn = db.conn.lock().map_err(|_| AppError::db("数据库连接被占用"))?;
    get_project_detail_conn(&conn, &project_id)
}
