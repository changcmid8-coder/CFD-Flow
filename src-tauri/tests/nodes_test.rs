use cfdflow_lib::commands::node::{
    create_node_conn, delete_node_conn, set_node_parent_conn, update_node_conn,
};
use cfdflow_lib::commands::project::{create_project_conn, get_project_detail_conn};
use cfdflow_lib::db;
use rusqlite::Connection;

fn setup_db() -> (tempfile::TempDir, Connection) {
    let dir = tempfile::tempdir().expect("tempdir");
    let conn = db::open_at(&dir.path().join("test.db")).expect("open db");
    (dir, conn)
}

fn insert_entry(conn: &Connection, node_id: &str, name: &str) -> String {
    let id = db::new_id();
    conn.execute(
        "INSERT INTO file_entries (id, project_id, node_id, original_path, file_name, size_bytes, registered_at, validity, archive_status, last_archive_batch_id)
         VALUES (?1, (SELECT project_id FROM nodes WHERE id=?2), ?2, ?3, ?3, 1, ?4, 'valid', 'pending', NULL)",
        rusqlite::params![id, node_id, name, db::now()],
    )
    .unwrap();
    id
}

#[test]
fn create_node_and_chain() {
    let (_d, conn) = setup_db();
    let p = create_project_conn(&conn, "演示算例", &None).unwrap();
    let a = create_node_conn(&conn, &p.id, "几何模型1-第一次调试", &None, &None).unwrap();
    let b = create_node_conn(&conn, &p.id, "几何模型1-第二次尝试", &Some("结果不佳，调整网格".to_string()),
        &Some(a.id.clone())).unwrap();
    let c = create_node_conn(&conn, &p.id, "第三次尝试", &None, &Some(b.id.clone())).unwrap();

    assert_eq!(b.parent_node_id.as_deref(), Some(a.id.as_str()));
    assert_eq!(c.parent_node_id.as_deref(), Some(b.id.as_str()));

    // 同名节点允许（FR-020）
    let d = create_node_conn(&conn, &p.id, &a.name, &None, &None).unwrap();
    assert_eq!(d.name, a.name);

    // 修改/解除关系
    let b2 = set_node_parent_conn(&conn, &b.id, &None).unwrap();
    assert!(b2.parent_node_id.is_none());
    let b3 = update_node_conn(&conn, &b.id, "改名后的第二次尝试", &None).unwrap();
    assert_eq!(b3.name, "改名后的第二次尝试");
}

#[test]
fn cycle_is_rejected() {
    let (_d, conn) = setup_db();
    let p = create_project_conn(&conn, "P", &None).unwrap();
    let a = create_node_conn(&conn, &p.id, "A", &None, &None).unwrap();
    let b = create_node_conn(&conn, &p.id, "B", &None, &Some(a.id.clone())).unwrap();
    let c = create_node_conn(&conn, &p.id, "C", &None, &Some(b.id.clone())).unwrap();

    // A -> B -> C 链上，把 A 的来源设为 C 或 B 都成环
    let e1 = set_node_parent_conn(&conn, &a.id, &Some(c.id.clone())).unwrap_err();
    assert_eq!(e1.code, "CYCLE_DETECTED");
    let e2 = set_node_parent_conn(&conn, &a.id, &Some(b.id.clone())).unwrap_err();
    assert_eq!(e2.code, "CYCLE_DETECTED");
    // 自引用同样成环
    let e3 = set_node_parent_conn(&conn, &b.id, &Some(b.id.clone())).unwrap_err();
    assert_eq!(e3.code, "CYCLE_DETECTED");
}

#[test]
fn parent_must_be_in_same_project() {
    let (_d, conn) = setup_db();
    let p1 = create_project_conn(&conn, "P1", &None).unwrap();
    let p2 = create_project_conn(&conn, "P2", &None).unwrap();
    let a = create_node_conn(&conn, &p1.id, "A", &None, &None).unwrap();
    let e = create_node_conn(&conn, &p2.id, "B", &None, &Some(a.id.clone())).unwrap_err();
    assert_eq!(e.code, "VALIDATION");
    let e2 = set_node_parent_conn(&conn, &a.id, &Some("not-exist".into())).unwrap_err();
    assert_eq!(e2.code, "NOT_FOUND");
}

#[test]
fn delete_node_moves_and_removes_entries() {
    let (_d, conn) = setup_db();
    let p = create_project_conn(&conn, "P", &None).unwrap();
    let a = create_node_conn(&conn, &p.id, "A", &None, &None).unwrap();
    let b = create_node_conn(&conn, &p.id, "B", &None, &Some(a.id.clone())).unwrap();
    let c = create_node_conn(&conn, &p.id, "C", &None, &None).unwrap();
    insert_entry(&conn, &a.id, "f1.txt");
    insert_entry(&conn, &a.id, "f2.txt");

    // 转移处置：文件移到 C，B 的来源（指向 A）置空
    let r = delete_node_conn(&conn, &a.id, "move_entries", &Some(c.id.clone())).unwrap();
    assert_eq!(r.moved, 2);
    let detail = get_project_detail_conn(&conn, &p.id).unwrap();
    assert_eq!(detail.nodes.iter().find(|n| n.id == b.id).unwrap().parent_node_id, None);
    assert!(detail.nodes.iter().all(|n| n.id != a.id));
    assert_eq!(detail.entries.iter().filter(|e| e.node_id == c.id).count(), 2);

    // 移除处置
    let a2 = create_node_conn(&conn, &p.id, "A2", &None, &None).unwrap();
    insert_entry(&conn, &a2.id, "g1.txt");
    let r2 = delete_node_conn(&conn, &a2.id, "remove_entries", &None).unwrap();
    assert_eq!(r2.removed, 1);
    let detail2 = get_project_detail_conn(&conn, &p.id).unwrap();
    assert!(detail2.entries.is_empty() || detail2.entries.iter().all(|e| e.node_id != a2.id));
}

#[test]
fn name_validation() {
    let (_d, conn) = setup_db();
    let p = create_project_conn(&conn, "P", &None).unwrap();
    let e = create_node_conn(&conn, &p.id, "  ", &None, &None).unwrap_err();
    assert_eq!(e.code, "VALIDATION");
    let long = "字".repeat(101);
    let e2 = create_node_conn(&conn, &p.id, &long, &None, &None).unwrap_err();
    assert_eq!(e2.code, "VALIDATION");
}
