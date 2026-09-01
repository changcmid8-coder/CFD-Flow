import { create } from 'zustand'

/** 节点区 UI 状态（数据本体在 stores/projects 的 ProjectDetail 中） */
interface NodesState {
  selectedNodeId: string | null
  hoveredNodeId: string | null
  /** 正在编辑的节点 id；'__new__' 表示新建 */
  editingId: string | null
  /** 新建时预填的来源节点 id（画布"新建下游"用） */
  pendingParent: string | null
  /** 查看调试链的节点 id */
  chainNodeId: string | null
  /** 删除确认中的节点 id */
  deletingId: string | null
  select: (id: string | null) => void
  setHovered: (id: string | null) => void
  startCreate: (parentId?: string) => void
  startEdit: (id: string) => void
  closeEditor: () => void
  showChain: (id: string | null) => void
  startDelete: (id: string | null) => void
}

export const useNodes = create<NodesState>((set) => ({
  selectedNodeId: null,
  hoveredNodeId: null,
  editingId: null,
  pendingParent: null,
  chainNodeId: null,
  deletingId: null,
  select: (id) => set({ selectedNodeId: id }),
  setHovered: (id) => set({ hoveredNodeId: id }),
  startCreate: (parentId) => set({ editingId: '__new__', pendingParent: parentId ?? null }),
  startEdit: (id) => set({ editingId: id, pendingParent: null }),
  closeEditor: () => set({ editingId: null, pendingParent: null }),
  showChain: (id) => set({ chainNodeId: id }),
  startDelete: (id) => set({ deletingId: id }),
}))

/** 计算节点集合中 id 的全部后代（用于上游选择器排除） */
export function descendantsOf(nodes: { id: string; parent_node_id: string | null }[], id: string): Set<string> {
  const children = new Map<string, string[]>()
  for (const n of nodes) {
    if (n.parent_node_id) {
      const arr = children.get(n.parent_node_id) ?? []
      arr.push(n.id)
      children.set(n.parent_node_id, arr)
    }
  }
  const out = new Set<string>([id])
  const stack = [id]
  while (stack.length) {
    const cur = stack.pop()!
    for (const c of children.get(cur) ?? []) {
      if (!out.has(c)) {
        out.add(c)
        stack.push(c)
      }
    }
  }
  return out
}

/** 回溯某节点的完整上游链（含自身，从根到自身） */
export function upstreamChain(nodes: { id: string; name: string; note: string | null; parent_node_id: string | null; created_at: string }[], id: string) {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const chain = []
  let cur = byId.get(id)
  let guard = 0
  while (cur && guard++ < 10000) {
    chain.unshift(cur)
    cur = cur.parent_node_id ? byId.get(cur.parent_node_id) : undefined
  }
  return chain
}

/** 某节点的直接下游 */
export function downstreamOf(nodes: { id: string; name: string; parent_node_id: string | null; created_at: string }[], id: string) {
  return nodes.filter((n) => n.parent_node_id === id)
}
