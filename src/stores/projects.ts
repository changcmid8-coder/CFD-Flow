import { create } from 'zustand'
import * as api from '../lib/api'

interface ProjectsState {
  projects: api.ProjectSummary[]
  loading: boolean
  error: string | null
  current: api.ProjectDetail | null
  refreshTick: number
  load: () => Promise<void>
  open: (id: string) => Promise<void>
  close: () => void
  create: (name: string, note?: string | null) => Promise<void>
  remove: (id: string) => Promise<void>
  refreshCurrent: () => Promise<void>
}

export const useProjects = create<ProjectsState>((set, get) => ({
  projects: [],
  loading: false,
  error: null,
  current: null,
  refreshTick: 0,

  load: async () => {
    set({ loading: true, error: null })
    try {
      const projects = await api.listProjects()
      set({ projects, loading: false })
    } catch (e) {
      set({ loading: false, error: (e as Error).message })
    }
  },

  open: async (id) => {
    set({ loading: true, error: null })
    try {
      const current = await api.getProjectDetail(id)
      set({ current, loading: false, refreshTick: get().refreshTick + 1 })
    } catch (e) {
      set({ loading: false, error: (e as Error).message })
    }
  },

  close: () => set({ current: null }),

  create: async (name, note) => {
    await api.createProject(name, note)
    await get().load()
  },

  remove: async (id) => {
    await api.deleteProject(id)
    if (get().current?.project.id === id) set({ current: null })
    await get().load()
  },

  refreshCurrent: async () => {
    const cur = get().current
    if (!cur) return
    try {
      const current = await api.getProjectDetail(cur.project.id)
      set({ current, refreshTick: get().refreshTick + 1 })
    } catch {
      /* 刷新失败保留旧数据，错误在下一次操作中呈现 */
    }
  },
}))
