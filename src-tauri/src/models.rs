use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub note: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProjectSummary {
    pub id: String,
    pub name: String,
    pub note: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub pending_count: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Node {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub note: Option<String>,
    pub parent_node_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct FileEntry {
    pub id: String,
    pub project_id: String,
    pub node_id: String,
    pub original_path: String,
    pub file_name: String,
    pub size_bytes: i64,
    pub registered_at: String,
    pub validity: String,
    pub archive_status: String,
    pub last_archive_batch_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ArchiveBatch {
    pub id: String,
    pub project_id: String,
    pub target_root: String,
    pub scope: String,
    pub total_files: i64,
    pub total_bytes: i64,
    pub status: String,
    pub source_disposition: String,
    pub started_at: String,
    pub finished_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct BatchSummary {
    pub id: String,
    pub project_id: String,
    pub target_root: String,
    pub scope: String,
    pub total_files: i64,
    pub total_bytes: i64,
    pub status: String,
    pub source_disposition: String,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub copied: i64,
    pub skipped: i64,
    pub failed: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ArchiveResultItem {
    pub id: String,
    pub batch_id: String,
    pub entry_id: String,
    pub dest_path: String,
    pub outcome: String,
    pub detail: Option<String>,
    pub source_deleted: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct SkippedPath {
    pub path: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct RegisterOutcome {
    pub entries: Vec<FileEntry>,
    pub skipped: Vec<SkippedPath>,
    pub total_scanned: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct RegisterProgress {
    pub node_id: String,
    pub scanned: usize,
    pub current_path: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProjectDetail {
    pub project: Project,
    pub nodes: Vec<Node>,
    pub entries: Vec<FileEntry>,
}
