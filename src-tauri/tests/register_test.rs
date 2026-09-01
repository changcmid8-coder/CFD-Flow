use cfdflow_lib::archive::util::io_path;
use cfdflow_lib::commands::entry::register_paths_conn;
use cfdflow_lib::commands::node::create_node_conn;
use cfdflow_lib::commands::project::{create_project_conn, get_project_detail_conn};
use cfdflow_lib::db;
use cfdflow_lib::models::RegisterProgress;
use rusqlite::Connection;
use std::fs;
use std::path::{Path, PathBuf};

fn setup_db() -> (tempfile::TempDir, Connection) {
    let dir = tempfile::tempdir().expect("tempdir");
    let conn = db::open_at(&dir.path().join("test.db")).expect("open db");
    (dir, conn)
}

fn write_file(path: &Path, size: usize) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(path, vec![7u8; size]).unwrap();
}

fn count_files(root: &Path) -> usize {
    let mut n = 0;
    if let Ok(rd) = fs::read_dir(root) {
        for e in rd.flatten() {
            let p = e.path();
            if p.is_dir() {
                n += count_files(&p);
            } else {
                n += 1;
            }
        }
    }
    n
}

#[test]
fn register_files_and_folders_zero_copy() {
    let (dir, conn) = setup_db();
    let p = create_project_conn(&conn, "P", &None).unwrap();
    let node = create_node_conn(&conn, &p.id, "第一次调试", &None, &None).unwrap();

    let src = dir.path().join("results");
    write_file(&src.join("case.out"), 100);
    write_file(&src.join("residual.dat"), 50);
    write_file(&src.join("post").join("slice.vtk"), 200);
    write_file(&src.join("post").join("deep").join("field.dat"), 300);
    fs::create_dir_all(src.join("emptydir")).unwrap();
    write_file(&src.join("网格#1 v2[最终].dat"), 42);

    let mut progress: Vec<RegisterProgress> = Vec::new();
    let outcome = register_paths_conn(
        &conn,
        &node.id,
        &[
            src.join("case.out").to_string_lossy().to_string(),
            src.join("residual.dat").to_string_lossy().to_string(),
            src.join("post").to_string_lossy().to_string(),
            src.join("emptydir").to_string_lossy().to_string(),
            src.join("网格#1 v2[最终].dat").to_string_lossy().to_string(),
            src.join("不存在.txt").to_string_lossy().to_string(),
        ],
        &mut |prog| progress.push(prog),
    )
    .unwrap();

    // 2 文件 + 文件夹内 2 文件 + 特殊字符文件 = 5 条登记
    assert_eq!(outcome.entries.len(), 5);
    assert_eq!(outcome.total_scanned, 5);

    // 文件夹为空 → skipped；路径不存在 → skipped
    assert_eq!(outcome.skipped.len(), 2);
    assert!(outcome.skipped.iter().any(|s| s.reason.contains("空")));
    assert!(outcome.skipped.iter().any(|s| s.reason.contains("无法读取")));

    // 零拷贝：登记前后磁盘文件集合不变
    assert_eq!(count_files(&src), 5);
    let entry = outcome.entries.iter().find(|e| e.file_name == "field.dat").unwrap();
    assert_eq!(entry.size_bytes, 300);
    assert_eq!(entry.archive_status, "pending");
    assert_eq!(entry.validity, "valid");

    // 进度事件已产生
    assert!(!progress.is_empty());

    // 持久化：重开连接后登记仍在（FR-014）
    drop(conn);
    let conn2 = db::open_at(&dir.path().join("test.db")).unwrap();
    let detail = get_project_detail_conn(&conn2, &p.id).unwrap();
    assert_eq!(detail.entries.len(), 5);
}

#[test]
fn register_long_path_and_deep_tree() {
    let (dir, conn) = setup_db();
    let p = create_project_conn(&conn, "P", &None).unwrap();
    let node = create_node_conn(&conn, &p.id, "长路径节点", &None, &None).unwrap();

    // 构造超过 260 字符的深层路径（创建与登记均经 verbatim 前缀处理）
    let seg = "求解器输出目录段-求解器输出目录段-求解器输出目录段-";
    let mut deep: PathBuf = dir.path().join("longbase");
    for _ in 0..8 {
        deep = deep.join(seg);
    }
    let target_file = deep.join("field.dat");
    fs::create_dir_all(io_path(&deep.to_string_lossy())).unwrap();
    fs::write(io_path(&target_file.to_string_lossy()), vec![1u8; 64]).unwrap();

    let outcome = register_paths_conn(
        &conn,
        &node.id,
        &[target_file.to_string_lossy().to_string()],
        &mut |_| {},
    )
    .unwrap();
    assert_eq!(outcome.entries.len(), 1);
    assert_eq!(outcome.entries[0].size_bytes, 64);
}
