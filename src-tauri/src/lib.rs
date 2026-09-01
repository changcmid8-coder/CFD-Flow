pub mod archive;
pub mod commands;
pub mod db;
pub mod error;
pub mod models;

use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use tauri::Manager;

/// 运行中归档批次的取消标志注册表
pub struct ArchiveRegistry(pub Mutex<HashMap<String, Arc<AtomicBool>>>);

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            db::init(app.handle())?;
            app.manage(ArchiveRegistry(Mutex::new(HashMap::new())));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::project::list_projects,
            commands::project::create_project,
            commands::project::update_project,
            commands::project::delete_project,
            commands::project::get_project_detail,
            commands::node::create_node,
            commands::node::update_node,
            commands::node::set_node_parent,
            commands::node::delete_node,
            commands::entry::register_files,
            commands::entry::remove_entry,
            commands::archive::preview_archive,
            commands::archive::execute_archive,
            commands::archive::cancel_archive,
            commands::archive::finalize_source_disposition,
            commands::archive::list_archive_batches,
            commands::archive::list_batch_results,
        ])
        .run(tauri::generate_context!())
        .expect("error while running cfdflow");
}
