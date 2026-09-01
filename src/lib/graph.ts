// 图数据派生与布局（纯函数，无 React 依赖）
// 契约见 specs/002-step-relation-graph/contracts/graph-view.md 与 data-model.md
import Dagre from '@dagrejs/dagre'
import type { ProjectDetail } from './api'

export const NODE_W = 240
export const NODE_H = 96

export interface GraphNodeSummary {
  id: string
  name: string
  note: string | null
  createdAt: string
  total: number
  pending: number
  archived: number
  missing: number
  sizeBytes: number
}

export interface GraphEdgeRef {
  /** derives：上游 parent；shared：配对节点（key 排序在前者） */
  source: string
  target: string
  kind: 'derives' | 'shared'
  /** shared：该节点对共享的不同源路径数 */
  count?: number
}

export interface GraphData {
  nodes: GraphNodeSummary[]
  derivesEdges: GraphEdgeRef[]
  sharedEdges: GraphEdgeRef[]
  /** 节点对 key（id 排序后 "a|b"）→ 共享文件名列表（悬停 tooltip 用） */
  sharedFiles: Map<string, string[]>
}

export function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|')
}

function fileNameOf(path: string): string {
  const idx = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  return idx >= 0 ? path.slice(idx + 1) : path
}

/** 从既有 ProjectDetail 派生图数据；口径与节点列表/登记列表唯一同源（FR-013）。 */
export function buildGraphData(detail: ProjectDetail): GraphData {
  const byNode = new Map<string, GraphNodeSummary>()
  for (const n of detail.nodes) {
    byNode.set(n.id, {
      id: n.id,
      name: n.name,
      note: n.note,
      createdAt: n.created_at,
      total: 0,
      pending: 0,
      archived: 0,
      missing: 0,
      sizeBytes: 0,
    })
  }

  // 按源路径分组，用于跨节点共享关系
  const pathGroups = new Map<string, Set<string>>()
  for (const e of detail.entries) {
    const s = byNode.get(e.node_id)
    if (s) {
      s.total += 1
      if (e.archive_status === 'pending') s.pending += 1
      if (e.validity === 'missing') s.missing += 1
      s.sizeBytes += e.size_bytes
    }
    let group = pathGroups.get(e.original_path)
    if (!group) {
      group = new Set()
      pathGroups.set(e.original_path, group)
    }
    group.add(e.node_id)
  }
  for (const s of byNode.values()) s.archived = s.total - s.pending

  // 来源边：恒为 parent→child（上游→下游）
  const derivesEdges: GraphEdgeRef[] = []
  for (const n of detail.nodes) {
    if (n.parent_node_id && byNode.has(n.parent_node_id)) {
      derivesEdges.push({ source: n.parent_node_id, target: n.id, kind: 'derives' })
    }
  }

  // 共享边：路径组内两两配对去重聚合
  const pairFiles = new Map<string, Set<string>>()
  for (const [path, nodeIds] of pathGroups) {
    if (nodeIds.size < 2) continue
    const arr = [...nodeIds]
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const key = pairKey(arr[i], arr[j])
        let set = pairFiles.get(key)
        if (!set) {
          set = new Set()
          pairFiles.set(key, set)
        }
        set.add(path)
      }
    }
  }
  const sharedEdges: GraphEdgeRef[] = []
  const sharedFiles = new Map<string, string[]>()
  for (const [key, files] of pairFiles) {
    const [a, b] = key.split('|')
    sharedEdges.push({ source: a, target: b, kind: 'shared', count: files.size })
    sharedFiles.set(key, [...files].map(fileNameOf).sort())
  }

  const nodes = [...byNode.values()].sort((x, y) => x.createdAt.localeCompare(y.createdAt))
  return { nodes, derivesEdges, sharedEdges, sharedFiles }
}

/** dagre 纵向分层布局（TB：上游在上、下游在下）。 */
export function computeLayout(
  nodes: GraphNodeSummary[],
  derivesEdges: GraphEdgeRef[],
): { positions: Map<string, { x: number; y: number }>; width: number; height: number } {
  const g = new Dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 72, marginx: 24, marginy: 24 })
  for (const n of nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H })
  for (const e of derivesEdges) g.setEdge(e.source, e.target)
  Dagre.layout(g)

  const positions = new Map<string, { x: number; y: number }>()
  let maxX = NODE_W
  let maxY = NODE_H
  for (const n of nodes) {
    const pos = g.node(n.id)
    const p = { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 }
    positions.set(n.id, p)
    if (p.x + NODE_W > maxX) maxX = p.x + NODE_W
    if (p.y + NODE_H > maxY) maxY = p.y + NODE_H
  }
  return { positions, width: maxX, height: maxY }
}
