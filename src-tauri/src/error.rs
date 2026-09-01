use serde::Serialize;
use std::fmt;

/// 统一错误模型：code 面向程序，message_zh 面向用户（发生了什么 + 该做什么）。
#[derive(Debug, Clone, Serialize)]
pub struct AppError {
    pub code: String,
    pub message_zh: String,
    pub detail: Option<String>,
}

impl AppError {
    pub fn new(code: &str, message_zh: impl Into<String>) -> Self {
        Self { code: code.into(), message_zh: message_zh.into(), detail: None }
    }

    pub fn with_detail(mut self, detail: impl fmt::Display) -> Self {
        self.detail = Some(detail.to_string());
        self
    }

    pub fn db(e: impl fmt::Display) -> Self {
        Self::new("DB_ERROR", "数据保存失败，请重试；若反复出现，请检查数据目录是否可写")
            .with_detail(e)
    }

    pub fn io(e: impl fmt::Display) -> Self {
        Self::new("IO_ERROR", "文件读写失败，请检查文件是否被占用或路径是否有效").with_detail(e)
    }

    pub fn cycle() -> Self {
        Self::new(
            "CYCLE_DETECTED",
            "不能将来源设为自身或自己的下游节点，这会形成循环",
        )
    }

    pub fn conflict_unresolved() -> Self {
        Self::new(
            "CONFLICT_UNRESOLVED",
            "存在未处理的同名文件冲突，请在归档确认页选择处理方式",
        )
    }

    pub fn not_found(what: &str) -> Self {
        Self::new("NOT_FOUND", format!("{}不存在或已被删除", what))
    }

    pub fn validation(msg: impl Into<String>) -> Self {
        Self::new("VALIDATION", msg)
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{}] {}", self.code, self.message_zh)
    }
}

impl std::error::Error for AppError {}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        AppError::db(e)
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::io(e)
    }
}
