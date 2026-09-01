// 前后端唯一接口层：命令封装与事件订阅（契约见 specs/001-cfd-workflow-archive/contracts/）
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export interface AppError {
  code: string
  message_zh: string
  detail?: string
}

export interface Project {
  id: string
  name: string
  note: string | null
  created_at: string
  updated_at: string
}

export interface ProjectSummary extends Project {
  pending_count: number
}

export interface Node {
  id: string
  project_id: string
  name: string
  note: string | null
  parent_node_id: string | null
  created_at: string
}

export interface FileEntry {
  id: string
  project_id: string
  node_id: string
  original_path: string
  file_name: string
  size_bytes: number
  registered_at: string
  validity: string
  archive_status: string
  last_archive_batch_id: string | null
}

export interface ProjectDetail {
  project: Project
  nodes: Node[]
  entries: FileEntry[]
}

export interface SkippedPath {
  path: string
  reason: string
}

export interface RegisterOutcome {
  entries: FileEntry[]
  skipped: SkippedPath[]
  total_scanned: number
}

export interface PreviewItem {
  entry_id: string
  node_id: string
  node_name: string
  current_path: string
  current_size: number
  validity: string
  dest_path: string
}

export interface Conflict {
  dest_path: string
  kind: string
}

export interface PreviewResult {
  items: PreviewItem[]
  total_files: number
  total_bytes: number
  conflicts: Conflict[]
  disk_free_bytes: number | null
}

export interface DeleteNodeResult {
  moved: number
  removed: number
}

export interface BatchSummary {
  id: string
  project_id: string
  target_root: string
  scope: string
  total_files: number
  total_bytes: number
  status: string
  source_disposition: string
  started_at: string
  finished_at: string | null
  copied: number
  skipped: number
  failed: number
}

export interface ArchiveResultItem {
  id: string
  batch_id: string
  entry_id: string
  dest_path: string
  outcome: string
  detail: string | null
  source_deleted: boolean
}

export interface FinalizeResult {
  deleted: number
  failed: { path: string; reason: string }[]
}

export interface ProgressEvt {
  batch_id: string
  done_files: number
  total_files: number
  done_bytes: number
  total_bytes: number
  current_file: string
  phase: string
}

export interface BatchFinal {
  batch_id: string
  status: string
  copied: number
  skipped: number
  failed: number
  copied_bytes: number
}

function unwrap<T>(p: Promise<T>): Promise<T> {
  return p.catch((e: AppError) => {
    const err = new Error(e?.message_zh || '操作失败') as Error & { code?: string }
    err.code = e?.code
    throw err
  })
}

// ---------- 工程 ----------
export const listProjects = () => unwrap<ProjectSummary[]>(invoke('list_projects'))
export const createProject = (name: string, note?: string | null) =>
  unwrap<Project>(invoke('create_project', { name, note: note ?? null }))
export const updateProject = (id: string, name: string, note?: string | null) =>
  unwrap<Project>(invoke('update_project', { id, name, note: note ?? null }))
export const deleteProject = (id: string) => unwrap<void>(invoke('delete_project', { id }))
export const getProjectDetail = (projectId: string) =>
  unwrap<ProjectDetail>(invoke('get_project_detail', { projectId }))

// ---------- 节点 ----------
export const createNode = (projectId: string, name: string, note?: string | null, parentNodeId?: string | null) =>
  unwrap<Node>(invoke('create_node', { projectId, name, note: note ?? null, parentNodeId: parentNodeId ?? null }))
export const updateNode = (nodeId: string, name: string, note?: string | null) =>
  unwrap<Node>(invoke('update_node', { nodeId, name, note: note ?? null }))
export const setNodeParent = (nodeId: string, parentNodeId?: string | null) =>
  unwrap<Node>(invoke('set_node_parent', { nodeId, parentNodeId: parentNodeId ?? null }))
export const deleteNode = (nodeId: string, disposition: string, targetNodeId?: string | null) =>
  unwrap<DeleteNodeResult>(invoke('delete_node', { nodeId, disposition, targetNodeId: targetNodeId ?? null }))

// ---------- 登记 ----------
export const registerFiles = (nodeId: string, paths: string[]) =>
  unwrap<RegisterOutcome>(invoke('register_files', { nodeId, paths }))
export const removeEntry = (entryId: string) => unwrap<void>(invoke('remove_entry', { entryId }))

// ---------- 归档 ----------
export const previewArchive = (projectId: string, targetRoot: string) =>
  unwrap<PreviewResult>(invoke('preview_archive', { projectId, targetRoot }))
export const executeArchive = (
  projectId: string,
  targetRoot: string,
  entryIds: string[],
  conflictPolicy: Record<string, string>,
  scope: string,
) =>
  unwrap<string>(
    invoke('execute_archive', { projectId, targetRoot, entryIds, conflictPolicy, scope }),
  )
export const cancelArchive = (batchId: string) => unwrap<void>(invoke('cancel_archive', { batchId }))
export const finalizeSourceDisposition = (batchId: string, keepSources: boolean) =>
  unwrap<FinalizeResult>(invoke('finalize_source_disposition', { batchId, keepSources }))
export const listArchiveBatches = (projectId: string) =>
  unwrap<BatchSummary[]>(invoke('list_archive_batches', { projectId }))
export const listBatchResults = (batchId: string) =>
  unwrap<ArchiveResultItem[]>(invoke('list_batch_results', { batchId }))

// ---------- 事件 ----------
export function onRegisterProgress(cb: (p: { node_id: string; scanned: number; current_path: string }) => void) {
  return listen('register://progress', (e) => cb(e.payload as never))
}
export function onArchiveProgress(cb: (p: ProgressEvt) => void) {
  return listen('archive://progress', (e) => cb(e.payload as never))
}
export function onArchiveFinished(cb: (f: BatchFinal) => void) {
  return listen('archive://finished', (e) => cb(e.payload as never))
}
