# Data Model: CFD 流程归档管理工具

**Feature**: `001-cfd-workflow-archive` | **Date**: 2026-08-31 | **Storage**: SQLite（见 research.md D2）

## 实体与关系

```text
Project 1──* Node 1──* FileEntry
                │             │
                │（上游来源，自引用，不可成环）
                └──*          └──* （经 archive_batch_id 关联最近一次成功归档）
           Node.parentNode          │
                                    *
                              ArchiveBatch 1──* ArchiveResultItem
```

## Project（工程）

| 字段 | 类型 | 约束/校验 |
|------|------|----------|
| id | TEXT (UUIDv4) | PK |
| name | TEXT | 非空，≤100 字符；工程间不强制唯一（同名工程归档时按 D2 消歧规则加序号） |
| note | TEXT | 可空，≤2000 字符 |
| created_at | TEXT (ISO 8601) | 服务器本地时间 |
| updated_at | TEXT (ISO 8601) | 任一子实体变更时刷新 |

## Node（调试节点）

| 字段 | 类型 | 约束/校验 |
|------|------|----------|
| id | TEXT (UUIDv4) | PK |
| project_id | TEXT | FK → Project.id，ON DELETE CASCADE |
| name | TEXT | 非空，≤100 字符；**工程内允许重复**（FR-020），展示时以 created_at + note 辅助区分 |
| note | TEXT | 可空，≤2000 字符 |
| parent_node_id | TEXT NULL | 自引用 FK → Node.id；**禁止成环**（应用层校验：设置上游时沿 parent 链向上遍历，遇自身即拒绝）；置空表示独立节点 |
| created_at | TEXT | — |

**状态**：节点无独立状态机；其"进度语义"由所挂 FileEntry 的归档状态聚合呈现（原则 III）。

**删除规则**（spec 边界场景）：删除节点时若仍有登记文件，必须先由用户选择"一并移除登记"或"转移文件到其他节点"；磁盘源文件任何情况下不被删除。下游节点（以本节点为 parent 的节点）不级联删除，删除后其 parent_node_id 置空。

## FileEntry（文件登记项）

| 字段 | 类型 | 约束/校验 |
|------|------|----------|
| id | TEXT (UUIDv4) | PK |
| project_id | TEXT | FK → Project.id（反规范化，便于工程级汇总查询），ON DELETE CASCADE |
| node_id | TEXT | FK → Node.id，ON DELETE 级联随节点删除策略 |
| original_path | TEXT | 源绝对路径（verbatim 处理见 research D5）；同一源文件可登记到多个节点（允许） |
| file_name | TEXT | 登记时的文件名 |
| size_bytes | INTEGER | 登记时 stat 的大小；归档汇总时重新 stat 以当前实际值为准 |
| registered_at | TEXT | — |
| validity | TEXT | `valid` \| `missing`：最近一次校验结果；登记/汇总预检时刷新 |
| archive_status | TEXT | `pending` \| `archived` |
| last_archive_batch_id | TEXT NULL | FK → ArchiveBatch.id，最近一次成功归档的批次 |

**状态机**：

```text
pending ──归档成功──▶ archived ──手动再次归档成功──▶ archived（批次指针更新）
   ▲                                                        │
   └──（不允许回退；已归档项不计入待归档汇总，FR-019）◀──────┘（无回退边）
```

- `pending → archived`：仅当所属文件在批次中复制成功。
- 已归档项可再次手动归档（复制到另一目录），同名冲突按 FR-011 三策略处理；不存在 `archived → pending` 回退。

## ArchiveBatch（归档批次）

| 字段 | 类型 | 约束/校验 |
|------|------|----------|
| id | TEXT (UUIDv4) | PK |
| project_id | TEXT | FK → Project.id |
| target_root | TEXT | 用户确认的目标根目录（两层结构 `target_root/工程名/节点名/` 由引擎自动创建） |
| scope | TEXT (JSON) | `{"mode":"all"} \| {"mode":"selected","node_ids":[...]}`（Q2：默认全量、可按节点勾选排除） |
| total_files / total_bytes | INTEGER | 确认页展示口径（预检后的实际值） |
| status | TEXT | `running` \| `completed` \| `cancelled` \| `failed` |
| source_disposition | TEXT | `kept` \| `deleted` \| `undecided` |
| started_at / finished_at | TEXT | — |

## ArchiveResultItem（批次结果明细）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | PK |
| batch_id | TEXT | FK → ArchiveBatch.id |
| entry_id | TEXT | 对应 FileEntry |
| dest_path | TEXT | 实际落盘路径（含消歧后的子目录） |
| outcome | TEXT | `copied` \| `skipped` \| `failed` |
| detail | TEXT | 失败/跳过原因（占用、权限、空间、策略跳过等），展示于结果报告（FR-013） |
| source_deleted | INTEGER (bool) | 源文件是否随 disposition=deleted 被删除；删除失败记录 detail |

## 归档目录消歧规则

- 子目录层级固定为 `target_root/<工程名>/<节点名>/`（Q5）。
- 工程内同名节点：首个用原名，后续按已有目录追加 `-2`、`-3`…（Q4）；同名工程同理。
- 批次内同节点下同名文件冲突走 FR-011 用户三策略；不与目录消歧混用。

## 术语表（canonical glossary）

| 术语 | 含义 | 禁用同义词 |
|------|------|-----------|
| 工程 | 顶层容器（Project） | 项目、案例 |
| 节点 | 调试尝试/流程步骤载体（Node） | 步骤、任务 |
| 上游来源 | node.parent_node_id 对应关系 | 父节点（UI 文案用"来源于"） |
| 登记 | 将文件挂接到节点的零拷贝动作（FileEntry） | 导入、添加文件 |
| 待归档 | archive_status=pending 的登记项 | 未归档 |
| 归档 | 复制到目标目录的批次动作（ArchiveBatch） | 备份、导出 |
| 保留/删除源文件 | 归档完成后对源文件的处置 | 清理、移动 |
