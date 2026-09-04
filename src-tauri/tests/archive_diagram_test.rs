use cfdflow_lib::commands::archive::save_archive_diagram_file;

#[test]
fn writes_diagram_into_project_dir() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_string_lossy().to_string();
    let path = save_archive_diagram_file(&root, "演示算例", b"PNGDATA1").unwrap();
    assert!(path.ends_with("流程图.png"));
    let expected = dir.path().join("演示算例").join("流程图.png");
    assert_eq!(std::path::Path::new(&path), expected);
    assert_eq!(std::fs::read(&expected).unwrap(), b"PNGDATA1");
}

#[test]
fn overwrites_previous_diagram() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_string_lossy().to_string();
    save_archive_diagram_file(&root, "P", b"OLD").unwrap();
    let path = save_archive_diagram_file(&root, "P", b"NEW-CONTENT").unwrap();
    assert_eq!(std::fs::read(&path).unwrap(), b"NEW-CONTENT");
    // 无 .tmp 残留
    assert!(!dir.path().join("P").join("流程图.png.tmp").exists());
}

#[test]
fn creates_missing_directories() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("deep").join("nested").join("root");
    let path = save_archive_diagram_file(root.to_string_lossy().as_ref(), "工程", b"X").unwrap();
    assert!(std::path::Path::new(&path).exists());
}

#[test]
fn rejects_empty_inputs() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_string_lossy().to_string();
    let e1 = save_archive_diagram_file(&root, "  ", b"X").unwrap_err();
    assert_eq!(e1.code, "VALIDATION");
    let e2 = save_archive_diagram_file("   ", "P", b"X").unwrap_err();
    assert_eq!(e2.code, "VALIDATION");
    let e3 = save_archive_diagram_file(&root, "P", b"").unwrap_err();
    assert_eq!(e3.code, "VALIDATION");
}
