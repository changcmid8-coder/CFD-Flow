use crate::db::{self, Db};
use crate::error::AppError;
use crate::models::Node;
use rusqlite::{params, Connection};
use serde::Serialize;
use tauri::State;

#[derive(Serialize)]
pub struct DeleteNodeResult {
    pub moved: i64,
    pub removed: i64,
}

fn validate_name(name: &str) -> Result<(), AppError> {
    if name.trim().is_empty() {
        return Err(AppError::validation("请输入节点名称"));
    }
    if name.chars().count() > 100 {
        return Err(AppError::validation("节点名称不能超过 100 个字符"));
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

fn node_exists(conn: &Connection, id: &str) -> Result<bool, AppError> {
    let n: i64 = conn
        .query_row("SELECT COUNT(*) FROM nodes WHERE id=?1", params![id], |r| r.get(0))
        .map_err(AppError::db)?;
    Ok(n > 0)
}

/// 沿 parent 链向上遍历；遇到 node_id 自身即成环。
fn would_cycle(conn: &Connection, node_id: &str, new_parent: &str) -> Result<bool, AppError> {
    let mut cur = new_parent.to_string();
    for _ in 0..10000 {
        if cur == node_id {
            return Ok(true);
        }
        let next: Option<String> = conn
            .query_row(
                "SELECT parent_node_id FROM nodes WHERE id=?1",
                params![cur],
                |r| r.get(0),
            )
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => AppError::not_found("来源节点"),
                other => AppError::db(other),
            })?;
        match next {
            Some(p) => cur = p,
            None => return Ok(false),
        }
    }
    Ok(true)
}

pub fn create_node_conn(
    conn: &Connection,
    project_id: &str,
    name: &str,
    note: &Option<String>,
    parent_node_id: &Option<String>,
) -> Result<Node, AppError> {
    validate_name(name)?;
    validate_note(note)?;
    let pc: i64 = conn
        .query_row("SELECT COUNT(*) FROM projects WHERE id=?1", params![project_id], |r| r.get(0))
        .map_err(AppError::db)?;
    if pc == 0 {
        return Err(AppError::not_found("工程"));
    }
    if let Some(pid) = parent_node_id {
        let parent: Option<String> = conn
            .query_row("SELECT project_id FROM nodes WHERE id=?1", params![pid], |r| r.get(0))
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => AppError::not_found("来源节点"),
                other => AppError::db(other),
            })?;
        if parent.as_deref() != Some(project_id) {
            return Err(AppError::validation("来源节点必须属于同一工程"));
        }
    }
    let id = db::new_id();
    let now = db::now();
    conn.execute(
        "INSERT INTO nodes (id, project_id, name, note, parent_node_id, created_at) VALUES (?1,?2,?3,?4,?5,?6)",
        params![id, project_id, name.trim(), note, parent_node_id, now],
    )
    .map_err(AppError::db)?;
    Ok(Node {
        id,
        project_id: project_id.to_string(),
        name: name.trim().to_string(),
        note: note.clone(),
        parent_node_id: parent_node_id.clone(),
        created_at: now,
    })
}

pub fn update_node_conn(conn: &Connection, node_id: &str, name: &str, note: &Option<String>) -> Result<Node, AppError> {
    validate_name(name)?;
    validate_note(note)?;
    let n = conn
        .execute(
            "UPDATE nodes SET name=?2, note=?3 WHERE id=?1",
            params![node_id, name.trim(), note],
        )
        .map_err(AppError::db)?;
    if n == 0 {
        return Err(AppError::not_found("节点"));
    }
    conn.query_row(
        "SELECT id, project_id, name, note, parent_node_id, created_at FROM nodes WHERE id=?1",
        params![node_id],
        |r| {
            Ok(Node {
                id: r.get(0)?,
                project_id: r.get(1)?,
                name: r.get(2)?,
                note: r.get(3)?,
                parent_node_id: r.get(4)?,
                created_at: r.get(5)?,
            })
        },
    )
    .map_err(AppError::db)
}

pub fn set_node_parent_conn(conn: &Connection, node_id: &str, parent_node_id: &Option<String>) -> Result<Node, AppError> {
    if !node_exists(conn, node_id)? {
        return Err(AppError::not_found("节点"));
    }
    if let Some(pid) = parent_node_id {
        if would_cycle(conn, node_id, pid)? {
            return Err(AppError::cycle());
        }
        let parent_project: Option<String> = conn
            .query_row("SELECT project_id FROM nodes WHERE id=?1", params![pid], |r| r.get(0))
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => AppError::not_found("来源节点"),
                other => AppError::db(other),
            })?;
        let my_project: String = conn
            .query_row("SELECT project_id FROM nodes WHERE id=?1", params![node_id], |r| r.get(0))
            .map_err(AppError::db)?;
        if parent_project.as_deref() != Some(my_project.as_str()) {
            return Err(AppError::validation("来源节点必须属于同一工程"));
        }
    }
    conn.execute(
        "UPDATE nodes SET parent_node_id=?2 WHERE id=?1",
        params![node_id, parent_node_id],
    )
    .map_err(AppError::db)?;
    conn.query_row(
        "SELECT id, project_id, name, note, parent_node_id, created_at FROM nodes WHERE id=?1",
        params![node_id],
        |r| {
            Ok(Node {
                id: r.get(0)?,
                project_id: r.get(1)?,
                name: r.get(2)?,
                note: r.get(3)?,
                parent_node_id: r.get(4)?,
                created_at: r.get(5)?,
            })
        },
    )
    .map_err(AppError::db)
}

/// 删除节点：登记文件按 disposition 处置（remove_entries 一并移除登记 / move_entries
/// 转移到 target_node_id）；下游节点来源置空；磁盘源文件任何情况下不受影响。
pub fn delete_node_conn(
    conn: &Connection,
    node_id: &str,
    disposition: &str,
    target_node_id: &Option<String>,
) -> Result<DeleteNodeResult, AppError> {
    if !node_exists(conn, node_id)? {
        return Err(AppError::not_found("节点"));
    }
    let mut moved = 0i64;
    let mut removed = 0i64;
    match disposition {
        "remove_entries" => {
            removed = conn
                .execute("DELETE FROM file_entries WHERE node_id=?1", params![node_id])
                .map_err(AppError::db)? as i64;
        }
        "move_entries" => {
            let target = target_node_id.as_deref().ok_or_else(|| {
                AppError::validation("请选择转移登记文件的目标节点")
            })?;
            if target == node_id {
                return Err(AppError::validation("不能把登记文件转移到被删除的节点自身"));
            }
            if !node_exists(conn, target)? {
                return Err(AppError::not_found("目标节点"));
            }
            moved = conn
                .execute("UPDATE file_entries SET node_id=?2 WHERE node_id=?1", params![node_id, target])
                .map_err(AppError::db)? as i64;
        }
        other => {
            return Err(AppError::validation(format!("未知的处置方式: {}", other)));
        }
    }
    // 下游节点来源置空（不级联删除）
    conn.execute(
        "UPDATE nodes SET parent_node_id=NULL WHERE parent_node_id=?1",
        params![node_id],
    )
    .map_err(AppError::db)?;
    conn.execute("DELETE FROM nodes WHERE id=?1", params![node_id])
        .map_err(AppError::db)?;
    Ok(DeleteNodeResult { moved, removed })
}

// ---------- Tauri 命令 ----------

#[tauri::command]
pub fn create_node(
    db: State<Db>,
    project_id: String,
    name: String,
    note: Option<String>,
    parent_node_id: Option<String>,
) -> Result<Node, AppError> {
    let conn = db.conn.lock().map_err(|_| AppError::db("数据库连接被占用"))?;
    create_node_conn(&conn, &project_id, &name, &note, &parent_node_id)
}

#[tauri::command]
pub fn update_node(db: State<Db>, node_id: String, name: String, note: Option<String>) -> Result<Node, AppError> {
    let conn = db.conn.lock().map_err(|_| AppError::db("数据库连接被占用"))?;
    update_node_conn(&conn, &node_id, &name, &note)
}

#[tauri::command]
pub fn set_node_parent(db: State<Db>, node_id: String, parent_node_id: Option<String>) -> Result<Node, AppError> {
    let conn = db.conn.lock().map_err(|_| AppError::db("数据库连接被占用"))?;
    set_node_parent_conn(&conn, &node_id, &parent_node_id)
}

#[tauri::command]
pub fn delete_node(
    db: State<Db>,
    node_id: String,
    disposition: String,
    target_node_id: Option<String>,
) -> Result<DeleteNodeResult, AppError> {
    let conn = db.conn.lock().map_err(|_| AppError::db("数据库连接被占用"))?;
    delete_node_conn(&conn, &node_id, &disposition, &target_node_id)
}
