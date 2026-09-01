# Interface Contract: Tauri 命令与事件

**Feature**: `001-cfd-workflow-archive` | **Date**: 2026-08-31

本契约是前端（`src/lib/`）与 Rust 后端（`src-tauri/src/commands/`）之间的唯一接口约定。
所有命令返回 `Result<T, AppError>`；错误统一为：

```jsonc
// AppError
{ "code": "SOURCE_MISSING | OCCUPIED | DISK_FULL | CONFLICT_UNRESOLVED | CYCLE_DETECTED | DB_ERROR | IO_ERROR | CANCELLED", "message_zh": "面向用户的中文提示（发生了什么 + 该做什么）", "detail": "可选的技术细节" }
```

时间字段一律 ISO 8601 字符串；大小字段一律字节数（前端负责格式化显示）。

## 命令（Commands）

### 工程

| 命令 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `list_projects` | — | `Project[]`（含各工程待归档计数） | 按 updated_at 倒序 |
| `create_project` | `name`, `note?` | `Project` | name 非空 ≤100 字符 |
| `update_project` | `id`, `{name?, note?}` | `Project` | — |
| `delete_project` | `id` | `void` | 级联删除节点/登记/批次（仅软件内记录，不动磁盘文件）；前端需确认 |
| `get_project_detail` | `project_id` | `{project, nodes[], entries[], last_batches[]}` | 切换工程时一次性加载 |

### 节点

| 命令 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `create_node` | `project_id`, `name`, `note?`, `parent_node_id?` | `Node` | name 允许重复（FR-020） |
| `update_node` | `node_id`, `{name?, note?}` | `Node` | — |
| `set_node_parent` | `node_id`, `parent_node_id \| null` | `Node` | 成环时返回 `CYCLE_DETECTED`（沿 parent 链向上遍历校验） |
| `delete_node` | `node_id`, `disposition: "remove_entries" \| "move_entries"`, `target_node_id?` | `{moved: number, removed: number}` | spec 边界场景：文件随删除策略处置，源文件不受影响；下游节点 parent 置空 |

### 文件登记

| 命令 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `register_files` | `node_id`, `paths: string[]` | `{entries: FileEntry[], skipped: [{path, reason}], total_scanned: number}` | **零拷贝**；Rust 递归展开文件夹、逐个 stat；文件夹为空/不可读记入 skipped；异步执行，进度经 `register://progress` 事件推送 |
| `remove_entry` | `entry_id` | `void` | 仅移除登记，磁盘源文件不受影响（FR-006） |

### 归档

| 命令 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `preview_archive` | `project_id` | `{items: [{entry_id, node_id, current_path, current_size, validity}], total_bytes, total_files, conflicts: [{dest_path, kind}], disk_free_bytes}` | 预检：重新 stat 每个源（刷新 validity）、检测目标空间与同名冲突；`conflicts` 为空才可直接执行（FR-007/FR-016） |
| `execute_archive` | `project_id`, `target_root`, `entry_ids: string[]`, `conflict_policy: {dest_path: "skip" \| "overwrite" \| "rename"}` | `batch_id` | 异步启动批次（两层目录 + `.part` 原子落盘）；进度经事件推送；未列入 entry_ids 的待归档项不受影响（Q2 勾选排除） |
| `cancel_archive` | `batch_id` | `void` | 在文件边界/内部检查点生效；完成后删除全部 `.part` 残留，批次状态 `cancelled`（FR-009） |
| `finalize_source_disposition` | `batch_id`, `keep_sources: boolean` | `{deleted: number, failed: [{path, reason}]}` | 仅对 outcome=copied 条目执行；`keep_sources=false` 删除源文件（前端必须先行二次确认）；失败逐条报告不中断（FR-012/FR-013） |
| `list_archive_batches` | `project_id` | `ArchiveBatch[]`（含结果明细计数） | 归档历史 |

## 事件（Events，后端 → 前端）

| 事件 | 载荷 | 时机 |
|------|------|------|
| `register://progress` | `{node_id, scanned, total_estimated, current_path}` | register_files 展开文件夹时 |
| `archive://progress` | `{batch_id, done_files, total_files, done_bytes, total_bytes, current_file, phase: "copying" \| "verifying" \| "finishing"}` | 每完成一个文件及批次阶段变化时（FR-009） |
| `archive://finished` | `{batch_id, status, copied, skipped, failed, total_bytes}` | 批次终结（completed/cancelled/failed） |

## 前端交互义务（契约的一部分）

- `execute_archive` 与 `finalize_source_disposition(keep_sources=false)` 调用前，前端 MUST 展示确认对话框；后者为二次显式确认（FR-012）。
- 所有错误 MUST 以 `message_zh` 呈现，禁止吞错（FR-013、章程原则 IV）。
- 所有列表 MUST 提供空状态、加载态与错误态（章程"体验与视觉标准"）。
