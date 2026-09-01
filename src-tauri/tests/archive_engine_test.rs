use cfdflow_lib::archive::engine::{run, Plan, PlanItem};
use cfdflow_lib::commands::entry::register_paths_conn;
use cfdflow_lib::commands::node::create_node_conn;
use cfdflow_lib::commands::project::create_project_conn;
use cfdflow_lib::db;
use rusqlite::Connection;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

fn setup_db() -> (tempfile::TempDir, Connection) {
    let dir = tempfile::tempdir().expect("tempdir");
    let conn = db::open_at(&dir.path().join("test.db")).expect("open db");
    (dir, conn)
}

fn write_file(path: &Path, size: usize) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(path, vec![9u8; size]).unwrap();
}

struct EntryRow {
    id: String,
    node_id: String,
    original_path: String,
    file_name: String,
    size_bytes: i64,
}

fn entries_of(conn: &Connection, project_id: &str) -> Vec<EntryRow> {
    let mut stmt = conn
        .prepare("SELECT id, node_id, original_path, file_name, size_bytes FROM file_entries WHERE project_id=?1 ORDER BY registered_at")
        .unwrap();
    stmt.query_map(rusqlite::params![project_id], |r| {
        Ok(EntryRow {
            id: r.get(0)?,
            node_id: r.get(1)?,
            original_path: r.get(2)?,
            file_name: r.get(3)?,
            size_bytes: r.get(4)?,
        })
    })
    .unwrap()
    .map(|x| x.unwrap())
    .collect()
}

fn count_by_ext(root: &Path, ext: &str) -> usize {
    let mut n = 0;
    if let Ok(rd) = fs::read_dir(root) {
        for e in rd.flatten() {
            let p = e.path();
            if p.is_dir() {
                n += count_by_ext(&p, ext);
            } else if p.to_string_lossy().ends_with(ext) {
                n += 1;
            }
        }
    }
    n
}

fn make_plan(
    db_path: &Path,
    conn: &Connection,
    batch: &str,
    project_id: &str,
    project: &str,
    target: &Path,
    items: Vec<PlanItem>,
) -> Plan {
    // 模拟生产流程：命令层在启动引擎前登记批次行
    let total: i64 = items.iter().map(|i| i.size as i64).sum();
    conn.execute(
        "INSERT INTO archive_batches (id, project_id, target_root, scope, total_files, total_bytes, status, source_disposition, started_at, finished_at)
         VALUES (?1,?2,?3,'all',?4,?5,'running','undecided',?6,NULL)",
        rusqlite::params![batch, project_id, target.to_string_lossy(), items.len() as i64, total, db::now()],
    )
    .unwrap();
    Plan {
        db_path: db_path.join("test.db").to_string_lossy().to_string(),
        batch_id: batch.to_string(),
        project_name: project.to_string(),
        target_root: target.to_string_lossy().to_string(),
        items,
        policies: HashMap::new(),
    }
}

fn item_of(e: &EntryRow, node_name: &str) -> PlanItem {
    PlanItem {
        entry_id: e.id.clone(),
        node_id: e.node_id.clone(),
        node_name: node_name.to_string(),
        src: e.original_path.clone(),
        file_name: e.file_name.clone(),
        size: e.size_bytes.max(0) as u64,
    }
}

#[test]
fn run_completes_two_level_layout_and_marks_archived() {
    let (dir, conn) = setup_db();
    let p = create_project_conn(&conn, "演示算例", &None).unwrap();
    let node = create_node_conn(&conn, &p.id, "第一次调试", &None, &None).unwrap();
    let src = dir.path().join("results");
    write_file(&src.join("case.out"), 100);
    write_file(&src.join("residual.dat"), 50);
    register_paths_conn(&conn, &node.id, &[
        src.join("case.out").to_string_lossy().to_string(),
        src.join("residual.dat").to_string_lossy().to_string(),
    ], &mut |_| {}).unwrap();

    let entries = entries_of(&conn, &p.id);
    let target = dir.path().join("archive");
    let batch_id = "batch-1".to_string();
    let plan = make_plan(dir.path(), &conn, &batch_id, &p.id, "演示算例", &target,
        entries.iter().map(|e| item_of(e, "第一次调试")).collect());

    let mut events = vec![];
    let fin = run(plan, Arc::new(AtomicBool::new(false)), |e| events.push(e));

    assert_eq!(fin.status, "completed");
    assert_eq!(fin.copied, 2);
    assert_eq!(fin.failed, 0);
    // 两层结构落盘
    let node_dir = target.join("演示算例").join("第一次调试");
    assert!(node_dir.join("case.out").exists());
    assert!(node_dir.join("residual.dat").exists());
    assert_eq!(fs::metadata(node_dir.join("case.out")).unwrap().len(), 100);
    // 无 .part 残留
    assert_eq!(count_by_ext(&target, ".part"), 0);
    // 进度事件已推送且包含 finishing 阶段
    assert!(events.iter().any(|e| e.phase == "finishing"));

    // 登记项已标记归档并指向批次；批次状态 completed
    let rows = entries_of(&conn, &p.id);
    let fresh = db::open_at(&dir.path().join("test.db")).unwrap();
    for e in &rows {
        let (status, batch): (String, String) = fresh
            .query_row("SELECT archive_status, last_archive_batch_id FROM file_entries WHERE id=?1",
                rusqlite::params![e.id], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
        assert_eq!(status, "archived");
        assert_eq!(batch, batch_id);
    }
    let (bstatus, copied): (String, i64) = fresh.query_row(
        "SELECT status, (SELECT COUNT(*) FROM archive_result_items WHERE batch_id=?1 AND outcome='copied') FROM archive_batches WHERE id=?1",
        rusqlite::params![batch_id], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
    assert_eq!(bstatus, "completed");
    assert_eq!(copied, 2);
}

#[test]
fn same_name_nodes_get_disambiguated_dirs() {
    let (dir, conn) = setup_db();
    let p = create_project_conn(&conn, "P", &None).unwrap();
    let n1 = create_node_conn(&conn, &p.id, "调试", &None, &None).unwrap();
    let n2 = create_node_conn(&conn, &p.id, "调试", &None, &None).unwrap();
    let src = dir.path().join("results");
    write_file(&src.join("a.txt"), 10);
    write_file(&src.join("b.txt"), 10);
    register_paths_conn(&conn, &n1.id, &[src.join("a.txt").to_string_lossy().to_string()], &mut |_| {}).unwrap();
    register_paths_conn(&conn, &n2.id, &[src.join("b.txt").to_string_lossy().to_string()], &mut |_| {}).unwrap();

    let entries = entries_of(&conn, &p.id);
    let name_of = |node_id: &str| if node_id == n1.id { "调试" } else { "调试" };
    let target = dir.path().join("archive");
    let plan = make_plan(dir.path(), &conn, "b2", &p.id, "P", &target,
        entries.iter().map(|e| item_of(e, name_of(&e.node_id))).collect());
    let fin = run(plan, Arc::new(AtomicBool::new(false)), |_| {});
    assert_eq!(fin.status, "completed");

    let pdir = target.join("P");
    assert!(pdir.join("调试").join("a.txt").exists());
    // 调试输出：实际落盘结构
    fn dump_tree(root: &Path, prefix: &str) {
        if let Ok(rd) = fs::read_dir(root) {
            for e in rd.flatten() {
                let p = e.path();
                eprintln!("[tree] {}{}", prefix, p.file_name().unwrap().to_string_lossy());
                if p.is_dir() {
                    dump_tree(&p, &(prefix.to_string() + "  "));
                }
            }
        }
    }
    dump_tree(&pdir, "");
    assert!(pdir.join("调试-2").join("b.txt").exists());
}

#[test]
fn cancel_before_and_mid_copy_leave_no_part() {
    let (dir, conn) = setup_db();
    let p = create_project_conn(&conn, "P", &None).unwrap();
    let node = create_node_conn(&conn, &p.id, "N", &None, &None).unwrap();
    let src = dir.path().join("results");
    write_file(&src.join("big.bin"), 30 * 1024 * 1024);
    register_paths_conn(&conn, &node.id, &[src.join("big.bin").to_string_lossy().to_string()], &mut |_| {}).unwrap();
    let entries = entries_of(&conn, &p.id);
    let target = dir.path().join("archive");

    // 批次开始前就取消
    let flag = Arc::new(AtomicBool::new(true));
    let plan = make_plan(dir.path(), &conn, "b3", &p.id, "P", &target, entries.iter().map(|e| item_of(e, "N")).collect());
    let fin = run(plan, flag, |_| {});
    assert_eq!(fin.status, "cancelled");
    assert_eq!(count_by_ext(&target, ".part"), 0);
    assert_eq!(count_by_ext(&target, "big.bin"), 0);

    // 复制中途取消（on_progress 在看到该文件的字节推进后置位取消标志）
    let flag2 = Arc::new(AtomicBool::new(false));
    let flag2b = flag2.clone();
    let plan2 = make_plan(dir.path(), &conn, "b4", &p.id, "P", &target, entries.iter().map(|e| item_of(e, "N")).collect());
    let fin2 = run(plan2, flag2.clone(), move |e| {
        if e.current_file == "big.bin" && e.done_bytes > 4 * 1024 * 1024 {
            flag2b.store(true, Ordering::Relaxed);
        }
    });
    assert_eq!(fin2.status, "cancelled");
    assert_eq!(fin2.copied, 0);
    assert_eq!(count_by_ext(&target, ".part"), 0);
    // 登记项仍为待归档
    let fresh = db::open_at(&dir.path().join("test.db")).unwrap();
    let rows = entries_of(&fresh, &p.id);
    for e in &rows {
        let s: String = fresh.query_row("SELECT archive_status FROM file_entries WHERE id=?1",
            rusqlite::params![e.id], |r| r.get(0)).unwrap();
        assert_eq!(s, "pending");
    }
}

#[test]
fn conflict_policies_skip_overwrite_rename() {
    let (dir, conn) = setup_db();
    let p = create_project_conn(&conn, "P", &None).unwrap();
    let node = create_node_conn(&conn, &p.id, "N", &None, &None).unwrap();
    let src = dir.path().join("results");
    write_file(&src.join("data.txt"), 10);
    register_paths_conn(&conn, &node.id, &[src.join("data.txt").to_string_lossy().to_string()], &mut |_| {}).unwrap();
    let entries = entries_of(&conn, &p.id);

    // 预置目标同名文件
    let target = dir.path().join("archive");
    let node_dir = target.join("P").join("N");
    fs::create_dir_all(&node_dir).unwrap();
    fs::write(node_dir.join("data.txt"), b"OLD-CONTENT").unwrap();

    // skip：保持旧内容，登记仍待归档
    let mut policies = HashMap::new();
    policies.insert(node_dir.join("data.txt").to_string_lossy().to_string(), "skip".to_string());
    let mut plan = make_plan(dir.path(), &conn, "b5", &p.id, "P", &target, entries.iter().map(|e| item_of(e, "N")).collect());
    plan.policies = policies;
    let f1 = run(plan, Arc::new(AtomicBool::new(false)), |_| {});
    assert_eq!((f1.status.as_str(), f1.skipped, f1.copied), ("completed", 1, 0));
    assert_eq!(fs::read(node_dir.join("data.txt")).unwrap(), b"OLD-CONTENT");

    // overwrite：覆盖为新内容
    let mut policies = HashMap::new();
    policies.insert(node_dir.join("data.txt").to_string_lossy().to_string(), "overwrite".to_string());
    let mut plan = make_plan(dir.path(), &conn, "b6", &p.id, "P", &target, entries.iter().map(|e| item_of(e, "N")).collect());
    plan.policies = policies;
    let f2 = run(plan, Arc::new(AtomicBool::new(false)), |_| {});
    assert_eq!((f2.status.as_str(), f2.copied), ("completed", 1));
    assert_eq!(fs::read(node_dir.join("data.txt")).unwrap().len(), 10);

    // rename：写入 data-2.txt，原文件不动
    fs::write(node_dir.join("data.txt"), b"OLD-CONTENT").unwrap();
    let mut policies = HashMap::new();
    policies.insert(node_dir.join("data.txt").to_string_lossy().to_string(), "rename".to_string());
    let mut plan = make_plan(dir.path(), &conn, "b7", &p.id, "P", &target, entries.iter().map(|e| item_of(e, "N")).collect());
    plan.policies = policies;
    let f3 = run(plan, Arc::new(AtomicBool::new(false)), |_| {});
    assert_eq!(f3.copied, 1);
    assert!(node_dir.join("data-2.txt").exists());
    assert_eq!(fs::read(node_dir.join("data.txt")).unwrap(), b"OLD-CONTENT");

    // 未提供策略 → 默认安全重命名（绝不静默覆盖）
    fs::write(node_dir.join("data.txt"), b"OLD-CONTENT").unwrap();
    let plan = make_plan(dir.path(), &conn, "b8", &p.id, "P", &target, entries.iter().map(|e| item_of(e, "N")).collect());
    let f4 = run(plan, Arc::new(AtomicBool::new(false)), |_| {});
    assert_eq!(f4.copied, 1);
    assert!(node_dir.join("data-2.txt").exists() || node_dir.join("data-3.txt").exists());
    assert_eq!(fs::read(node_dir.join("data.txt")).unwrap(), b"OLD-CONTENT");
}

#[test]
fn missing_source_fails_visibly_others_continue() {
    let (dir, conn) = setup_db();
    let p = create_project_conn(&conn, "P", &None).unwrap();
    let node = create_node_conn(&conn, &p.id, "N", &None, &None).unwrap();
    let src = dir.path().join("results");
    write_file(&src.join("ok.txt"), 10);
    write_file(&src.join("gone.txt"), 10);
    register_paths_conn(&conn, &node.id, &[
        src.join("ok.txt").to_string_lossy().to_string(),
        src.join("gone.txt").to_string_lossy().to_string(),
    ], &mut |_| {}).unwrap();
    if src.join("gone.txt").exists() {
        fs::remove_file(src.join("gone.txt")).unwrap();
    }
    let entries = entries_of(&conn, &p.id);
    assert_eq!(entries.len(), 2);

    let target = dir.path().join("archive");
    let plan = make_plan(dir.path(), &conn, "b9", &p.id, "P", &target, entries.iter().map(|e| item_of(e, "N")).collect());
    let fin = run(plan, Arc::new(AtomicBool::new(false)), |_| {});
    assert_eq!(fin.status, "completed");
    assert_eq!(fin.copied, 1);
    assert_eq!(fin.failed, 1);
    assert!(target.join("P").join("N").join("ok.txt").exists());

    // 失败明细可见（FR-013）：SOURCE_MISSING
    let fresh = db::open_at(&dir.path().join("test.db")).unwrap();
    let (outcome, detail): (String, String) = fresh.query_row(
        "SELECT outcome, detail FROM archive_result_items WHERE batch_id='b9' AND outcome='failed'",
        [], |r| Ok((r.get(0)?, r.get(1)?))).unwrap();
    assert!(detail.contains("SOURCE_MISSING"));
    let _ = outcome;
}

#[test]
fn finalize_disposition_keeps_or_deletes_sources() {
    let (dir, conn) = setup_db();
    let p = create_project_conn(&conn, "P", &None).unwrap();
    let node = create_node_conn(&conn, &p.id, "N", &None, &None).unwrap();
    let src = dir.path().join("results");
    write_file(&src.join("a.txt"), 10);
    write_file(&src.join("b.txt"), 10);
    register_paths_conn(&conn, &node.id, &[
        src.join("a.txt").to_string_lossy().to_string(),
        src.join("b.txt").to_string_lossy().to_string(),
    ], &mut |_| {}).unwrap();
    let entries = entries_of(&conn, &p.id);
    let target = dir.path().join("archive");
    let plan = make_plan(dir.path(), &conn, "b10", &p.id, "P", &target, entries.iter().map(|e| item_of(e, "N")).collect());
    let fin = run(plan, Arc::new(AtomicBool::new(false)), |_| {});
    assert_eq!(fin.copied, 2);

    // keep：源文件原样
    let r = cfdflow_lib::commands::archive::finalize_source_disposition_conn(
        &conn, "b10", true).unwrap();
    assert_eq!(r.deleted, 0);
    assert!(src.join("a.txt").exists() && src.join("b.txt").exists());

    // delete：源文件删除；不可删除的源（此处用目录路径注入失败）逐条报告，不中断（FR-012/FR-013）
    let stub_dir = src.join("undeletable-stub");
    fs::create_dir_all(&stub_dir).unwrap();
    conn.execute(
        "UPDATE file_entries SET original_path=?1 WHERE file_name='b.txt'",
        rusqlite::params![stub_dir.to_string_lossy().to_string()],
    )
    .unwrap();
    let r2 = cfdflow_lib::commands::archive::finalize_source_disposition_conn(
        &conn, "b10", false).unwrap();
    assert_eq!(r2.deleted, 1);
    assert_eq!(r2.failed.len(), 1);
    assert!(!src.join("a.txt").exists());
    assert!(src.join("b.txt").exists());
    // 恢复可写，便于临时目录清理
    let mut perm = fs::metadata(src.join("b.txt")).unwrap().permissions();
    perm.set_readonly(false);
    fs::set_permissions(src.join("b.txt"), perm).unwrap();

    // 批次处置状态已记录
    let disp: String = conn.query_row(
        "SELECT source_disposition FROM archive_batches WHERE id='b10'", [], |r| r.get(0)).unwrap();
    assert_eq!(disp, "deleted");
}

#[test]
fn stale_running_batches_are_closed_on_open() {
    let (dir, conn) = setup_db();
    conn.execute(
        "INSERT INTO archive_batches (id, project_id, target_root, scope, total_files, total_bytes, status, source_disposition, started_at, finished_at)
         VALUES ('stale', NULL, 'C:\\x', 'all', 0, 0, 'running', 'undecided', ?1, NULL)",
        rusqlite::params![db::now()],
    ).unwrap_err(); // project_id 为 NULL 违反外键——预期失败，插入合法行再测
    let p = create_project_conn(&conn, "P", &None).unwrap();
    conn.execute(
        "INSERT INTO archive_batches (id, project_id, target_root, scope, total_files, total_bytes, status, source_disposition, started_at, finished_at)
         VALUES ('stale', ?1, 'C:\\x', 'all', 0, 0, 'running', 'undecided', ?2, NULL)",
        rusqlite::params![p.id, db::now()],
    ).unwrap();
    // 重开数据库触发启动清理
    drop(conn);
    let conn2 = db::open_at(&dir.path().join("test.db")).unwrap();
    let s: String = conn2.query_row("SELECT status FROM archive_batches WHERE id='stale'", [], |r| r.get(0)).unwrap();
    assert_eq!(s, "cancelled");
}
