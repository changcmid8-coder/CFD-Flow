import { create } from 'zustand'
import * as api from '../lib/api'

interface EntriesState {
  /** 登记进行中状态 */
  registering: boolean
  scanned: number
  currentPath: string
  /** 最近一次登记的结果提示（toast） */
  toast: { kind: 'ok' | 'warn' | 'err'; text: string } | null
  setToast: (t: EntriesState['toast']) => void
  register: (nodeId: string, paths: string[], done: () => Promise<void>) => Promise<void>
  remove: (entryId: string, done: () => Promise<void>) => Promise<void>
}

export const useEntries = create<EntriesState>((set) => ({
  registering: false,
  scanned: 0,
  currentPath: '',
  toast: null,
  setToast: (toast) => set({ toast }),

  register: async (nodeId, paths, done) => {
    set({ registering: true, scanned: 0, currentPath: '' })
    try {
      const outcome = await api.registerFiles(nodeId, paths)
      await done()
      const skipNote = outcome.skipped.length
        ? `；${outcome.skipped.length} 项已跳过（${outcome.skipped[0].reason}）`
        : ''
      set({
        registering: false,
        toast: { kind: outcome.skipped.length ? 'warn' : 'ok', text: `已登记 ${outcome.entries.length} 个文件${skipNote}` },
      })
    } catch (e) {
      set({ registering: false, toast: { kind: 'err', text: (e as Error).message } })
    }
  },

  remove: async (entryId, done) => {
    try {
      await api.removeEntry(entryId)
      await done()
    } catch (e) {
      set({ toast: { kind: 'err', text: (e as Error).message } })
    }
  },
}))
