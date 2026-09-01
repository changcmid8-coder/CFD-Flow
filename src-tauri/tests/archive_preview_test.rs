use cfdflow_lib::commands::archive::preview_conn;
use cfdflow_lib::commands::entry::register_paths_conn;
use cfdflow_lib::commands::node::create_node_conn;
use cfdflow_lib::commands::project::create_project_conn;
use cfdflow_lib::db;
use rusqlite::Connection;
use std::fs;
use std::path::Path;

fn setup_db() -> (tempfile::TempDir, Connection) {
    let dir = tempfile::tempdir().expect("tempdir");
    let conn = db::open_at(&dir.path().join("test.db")).expect("open db");
    (dir, conn)
}

fn write_file(path: &Path, size: usize) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(path, vec![3u8; size]).unwrap();
}

fn prepare(dir: &Path, conn: &Connection) -> (String, Vec<String>) {
    let p = create_project_conn(conn, "演示算例", &None).unwrap();
    let node = create_node_conn(conn, &p.id, "第一次调试", &None, &None).unwrap();
    let src = dir.join("results");
    write_file(&src.join("case.out"), 100);
    write_file(&src.join("residual.dat"), 50);
    write_file(&src.join("post").join("slice.vtk"), 200);
    register_paths_conn(
        conn,
        &node.id,
        &[
            src.join("case.out").to_string_lossy().to_string(),
            src.join("residual.dat").to_string_lossy().to_string(),
            src.join("post").to_string_lossy().to_string(),
        ],
        &mut |_| {},
    )
    .unwrap();
    (p.id, vec![src.join("case.out").to_string_lossy().to_string(), src.join("residual.dat").to_string_lossy().to_string(), src.join("post").to_string_lossy().to_string()])
}

#[test]
fn preview_reports_sizes_validity_and_layout() {
    let (dir, conn) = setup_db();
    let (project_id, _srcs) = prepare(dir.path(), &conn);
    let target = dir.path().join("archive");

    let pv = preview_conn(&conn, &project_id, &target.to_string_lossy()).unwrap();
    assert_eq!(pv.total_files, 3);
    assert_eq!(pv.total_bytes, 350);
    assert!(pv.items.iter().all(|i| i.validity == "valid"));
    // 两层结构：目标根/工程名/节点名（消歧模拟）
    assert!(pv.items.iter().all(|i| i.dest_path.contains("演示算例")));
    assert!(pv.items.iter().all(|i| i.dest_path.contains("第一次调试")));
    assert!(pv.disk_free_bytes.is_some());
    // 预检不写入任何目标文件
    assert!(!target.join("演示算例").exists() || fs::read_dir(target.join("演示算例")).unwrap().next().is_none());
}

#[test]
fn preview_detects_missing_sources() {
    let (dir, conn) = setup_db();
    let (project_id, srcs) = prepare(dir.path(), &conn);
    let target = dir.path().join("archive2");
    fs::remove_file(&srcs[1]).unwrap(); // residual.dat 被移动/删除

    let pv = preview_conn(&conn, &project_id, &target.to_string_lossy()).unwrap();
    let missing: Vec<_> = pv.items.iter().filter(|i| i.validity == "missing").collect();
    assert_eq!(missing.len(), 1);
    assert!(missing[0].current_path.ends_with("residual.dat"));
    assert_eq!(missing[0].current_size, 0);
    // 数据库中 validity 已刷新
    let v: String = conn
        .query_row("SELECT validity FROM file_entries WHERE original_path=?1", rusqlite::params![srcs[1]], |r| r.get(0))
        .unwrap();
    assert_eq!(v, "missing");
}

#[test]
fn preview_detects_dest_conflicts() {
    let (dir, conn) = setup_db();
    let (project_id, _srcs) = prepare(dir.path(), &conn);
    let target = dir.path().join("archive3");
    // 目标目录已存在上次归档的同名产物
    let dest_dir = target.join("演示算例").join("第一次调试");
    fs::create_dir_all(&dest_dir).unwrap();
    fs::write(dest_dir.join("case.out"), b"OLD").unwrap();

    let pv = preview_conn(&conn, &project_id, &target.to_string_lossy()).unwrap();
    assert_eq!(pv.conflicts.len(), 1);
    assert_eq!(pv.conflicts[0].kind, "existing_file");
    assert!(pv.conflicts[0].dest_path.ends_with("case.out"));
}
