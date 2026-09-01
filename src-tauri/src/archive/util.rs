use std::collections::HashSet;
use std::path::{Path, PathBuf};

/// Windows 长路径（>240 字符）加 verbatim 前缀；UNC 路径使用 \\?\UNC\。
/// 仅用于文件 IO 调用；存储仍保存用户可读的原始路径。
pub fn io_path(p: &str) -> PathBuf {
    let t = p.trim();
    if cfg!(windows) && t.len() > 240 && !t.starts_with("\\\\?\\") {
        if t.starts_with("\\\\") {
            PathBuf::from(format!("\\\\?\\UNC\\{}", &t[2..]))
        } else {
            PathBuf::from(format!("\\\\?\\{}", t))
        }
    } else {
        PathBuf::from(t)
    }
}

/// 目录名清洗：替换 Windows 非法字符，去掉结尾的点和空格。
pub fn safe_name(name: &str) -> String {
    let s: String = name
        .chars()
        .map(|c| {
            if matches!(c, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|') {
                '_'
            } else {
                c
            }
        })
        .collect();
    let t = s.trim_end_matches(['.', ' ']).to_string();
    if t.is_empty() { "_".to_string() } else { t }
}

/// 在 parent 下为目录名消歧：只看本批次已占用集合（taken）。
/// 磁盘上已存在的目录一律复用——归档是持续累积行为，同一工程/节点
/// 多次归档应写入同一目录，文件级冲突由 FR-011 的三策略处理。
pub fn disambiguate_dir(parent: &Path, name: &str, taken: &mut HashSet<String>) -> PathBuf {
    let base = safe_name(name);
    let mut idx: u32 = 0; // 0=原名，1=-2，2=-3……
    loop {
        let n = if idx == 0 { base.clone() } else { format!("{}-{}", base, idx + 1) };
        let p = parent.join(&n);
        let s = p.to_string_lossy().to_string();
        if !taken.contains(&s) {
            taken.insert(s);
            return p;
        }
        idx += 1;
        if idx > 9999 {
            let p = parent.join(format!("{}-{}", base, chrono::Local::now().timestamp_subsec_nanos()));
            taken.insert(p.to_string_lossy().to_string());
            return p;
        }
    }
}

/// 文件名冲突 rename 策略：name-2.ext、name-3.ext……
pub fn unique_file_path(dir: &Path, file_name: &str) -> PathBuf {
    let dest = dir.join(file_name);
    if !dest.exists() {
        return dest;
    }
    let stem = Path::new(file_name)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| file_name.to_string());
    let ext = Path::new(file_name)
        .extension()
        .map(|s| s.to_string_lossy().to_string());
    for n in 2..10000u32 {
        let cand = match &ext {
            Some(e) => dir.join(format!("{}-{}.{}", stem, n, e)),
            None => dir.join(format!("{}-{}", stem, n)),
        };
        if !cand.exists() {
            return cand;
        }
    }
    dir.join(format!(
        "{}-{}.{}",
        stem,
        chrono::Local::now().timestamp_subsec_nanos(),
        ext.unwrap_or_default()
    ))
}

/// 将 IO 错误分类为契约错误码 + 中文用户提示。
pub fn classify_io(e: &std::io::Error) -> (&'static str, String) {
    match e.raw_os_error() {
        Some(2) | Some(3) => (
            "SOURCE_MISSING",
            "源文件已被移动或删除，请重新指定位置或移除该登记".to_string(),
        ),
        Some(5) => (
            "IO_ERROR",
            "没有访问该文件的权限，请检查文件属性或以可写位置重试".to_string(),
        ),
        Some(32) | Some(33) => (
            "OCCUPIED",
            "文件正被其他程序占用，请稍后重试或关闭占用它的程序".to_string(),
        ),
        Some(112) => (
            "DISK_FULL",
            "目标磁盘空间不足，请清理空间或更换目标目录".to_string(),
        ),
        _ => (
            "IO_ERROR",
            "文件读写失败，请检查文件是否被占用或路径是否有效".to_string(),
        ),
    }
}

/// 取 target_root 及其最近存在祖先的可用空间（字节）；全部不可得时返回 None。
pub fn disk_free(root: &Path) -> Option<u64> {
    let mut cur = root.to_path_buf();
    for _ in 0..6 {
        if cur.exists() {
            return fs4::available_space(&cur).ok();
        }
        cur = cur.parent()?.to_path_buf();
    }
    None
}
