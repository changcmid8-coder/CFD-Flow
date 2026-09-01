import { create } from 'zustand'
import * as api from '../lib/api'

export type ConflictPolicy = 'skip' | 'overwrite' | 'rename'

interface ArchiveState {
  phase: 'idle' | 'confirm' | 'progress' | 'result'
  loading: boolean
  error: string | null
  preview: api.PreviewResult | null
  /** 勾选的节点（确认页按节点排除，默认全选） */
  checkedNodes: Set<string>
  policies: Record<string, ConflictPolicy>
  batchId: string | null
  progress: api.ProgressEvt | null
  final: api.BatchFinal | null
  /** 处置询问 */
  disposition: { batchId: string; copied: number } | null
  notice: { kind: 'ok' | 'warn' | 'err'; text: string } | null
  historyOpen: boolean

  openConfirm: (projectId: string, targetRoot: string) => Promise<void>
  toggleNode: (nodeId: string) => void
  setPolicy: (destPath: string, policy: ConflictPolicy) => void
  setBatchId: (id: string) => void
  setProgress: (p: api.ProgressEvt) => void
  setFinal: (f: api.BatchFinal) => void
  runDisposition: (keepSources: boolean, done: () => Promise<void>) => Promise<void>
  reset: () => void
  setHistoryOpen: (open: boolean) => void
  setError: (msg: string | null) => void
  setNotice: (n: ArchiveState['notice']) => void
}

export const useArchive = create<ArchiveState>((set, get) => ({
  phase: 'idle',
  loading: false,
  error: null,
  preview: null,
  checkedNodes: new Set(),
  policies: {},
  batchId: null,
  progress: null,
  final: null,
  disposition: null,
  notice: null,
  historyOpen: false,

  openConfirm: async (projectId, targetRoot) => {
    set({ phase: 'confirm', loading: true, error: null, final: null, progress: null, notice: null })
    try {
      const preview = await api.previewArchive(projectId, targetRoot)
      const checkedNodes = new Set(preview.items.map((i) => i.node_id))
      const policies: Record<string, ConflictPolicy> = {}
      for (const c of preview.conflicts) policies[c.dest_path] = 'rename'
      set({ preview, checkedNodes, policies, loading: false })
    } catch (e) {
      set({ loading: false, error: (e as Error).message, preview: null })
    }
  },

  toggleNode: (nodeId) => {
    const cur = new Set(get().checkedNodes)
    if (cur.has(nodeId)) cur.delete(nodeId)
    else cur.add(nodeId)
    set({ checkedNodes: cur })
  },

  setPolicy: (destPath, policy) => set({ policies: { ...get().policies, [destPath]: policy } }),

  setBatchId: (id) => set({ batchId: id, phase: 'progress', progress: null }),
  setProgress: (p) => set({ progress: p }),

  setFinal: (f) => {
    const st = get()
    // 仅当结束事件属于当前批次时切换到结果页
    if (st.batchId && f.batch_id === st.batchId) {
      set({
        final: f,
        phase: 'result',
        disposition: f.copied > 0 ? { batchId: f.batch_id, copied: f.copied } : null,
      })
    }
  },

  runDisposition: async (keepSources, done) => {
    const d = get().disposition
    if (!d) return
    try {
      const r = await api.finalizeSourceDisposition(d.batchId, keepSources)
      const note = keepSources
        ? '已保留源文件'
        : r.failed.length
          ? `${r.failed.length} 个源文件删除失败，详见失败明细`
          : `已删除 ${r.deleted} 个源文件`
      set({ disposition: null, notice: { kind: r.failed.length ? 'warn' : 'ok', text: note } })
      await done()
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  reset: () =>
    set({ phase: 'idle', preview: null, checkedNodes: new Set(), policies: {}, batchId: null, progress: null, final: null, disposition: null, error: null, notice: null }),

  setHistoryOpen: (open) => set({ historyOpen: open }),
  setError: (msg) => set({ error: msg }),
  setNotice: (n) => set({ notice: n }),
}))
