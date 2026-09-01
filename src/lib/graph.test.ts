import { describe, expect, it } from 'vitest'
import { buildGraphData, computeLayout, NODE_H, NODE_W } from './graph'
import type { FileEntry, Node, ProjectDetail } from './api'

function makeDetail(nodes: Array<Pick<Node, 'id' | 'parent_node_id' | 'name'>>, entries: Array<Partial<FileEntry> & { node_id: string; original_path: string }>): ProjectDetail {
  return {
    project: { id: 'p1', name: 'P', note: null, created_at: 't0', updated_at: 't0' },
    nodes: nodes.map((n, i) => ({
      id: n.id,
      project_id: 'p1',
      name: n.name,
      note: null,
      parent_node_id: n.parent_node_id,
      created_at: `2026-08-31T10:00:${String(i).padStart(2, '0')}`,
    })),
    entries: entries.map((e, i) => ({
      id: `e${i}`,
      project_id: 'p1',
      node_id: e.node_id,
      original_path: e.original_path,
      file_name: e.original_path.split(/[\\/]/).pop() ?? e.original_path,
      size_bytes: e.size_bytes ?? 100,
      registered_at: `2026-08-31T11:00:${String(i).padStart(2, '0')}`,
      validity: e.validity ?? 'valid',
      archive_status: e.archive_status ?? 'pending',
      last_archive_batch_id: null,
    })),
  }
}

const CHAIN = [
  { id: 'A', parent_node_id: null, name: 'A' },
  { id: 'B', parent_node_id: 'A', name: 'B' },
  { id: 'C', parent_node_id: 'B', name: 'C' },
]

describe('buildGraphData 摘要口径（FR-013）', () => {
  it('aggregates per-node counts, sizes and states', () => {
    const detail = makeDetail(CHAIN, [
      { node_id: 'A', original_path: 'D:\\r\\a1.out', size_bytes: 10 },
      { node_id: 'A', original_path: 'D:\\r\\a2.out', size_bytes: 20, archive_status: 'archived' },
      { node_id: 'B', original_path: 'D:\\r\\b1.dat', size_bytes: 5, validity: 'missing' },
    ])
    const g = buildGraphData(detail)
    const a = g.nodes.find((n) => n.id === 'A')!
    const b = g.nodes.find((n) => n.id === 'B')!
    const c = g.nodes.find((n) => n.id === 'C')!
    expect(a.total).toBe(2)
    expect(a.pending).toBe(1)
    expect(a.archived).toBe(1)
    expect(a.sizeBytes).toBe(30)
    expect(b.total).toBe(1)
    expect(b.missing).toBe(1)
    expect(c.total).toBe(0)
    expect(g.nodes).toHaveLength(3)
  })
})

describe('buildGraphData 来源边方向（FR-003）', () => {
  it('derives edges always go parent → child', () => {
    const g = buildGraphData(makeDetail(CHAIN, []))
    expect(g.derivesEdges).toEqual([
      { source: 'A', target: 'B', kind: 'derives' },
      { source: 'B', target: 'C', kind: 'derives' },
    ])
  })

  it('independent nodes produce no edges', () => {
    const g = buildGraphData(makeDetail([
      { id: 'D1', parent_node_id: null, name: 'D1' },
      { id: 'D2', parent_node_id: null, name: 'D2' },
    ], []))
    expect(g.derivesEdges).toHaveLength(0)
    expect(g.sharedEdges).toHaveLength(0)
  })

  it('empty project yields empty graph', () => {
    const g = buildGraphData(makeDetail([], []))
    expect(g.nodes).toHaveLength(0)
    expect(g.derivesEdges).toHaveLength(0)
    expect(g.sharedEdges).toHaveLength(0)
  })
})

describe('buildGraphData 共享文件边（FR-006）', () => {
  it('pairwise dedup: one shared file across two nodes → one edge, count 1', () => {
    const detail = makeDetail(CHAIN, [
      { node_id: 'A', original_path: 'D:\\m\\geom.step' },
      { node_id: 'C', original_path: 'D:\\m\\geom.step' },
    ])
    const g = buildGraphData(detail)
    expect(g.sharedEdges).toEqual([{ source: 'A', target: 'C', kind: 'shared', count: 1 }])
    const key = ['A', 'C'].sort().join('|')
    expect(g.sharedFiles.get(key)).toEqual(['geom.step'])
  })

  it('aggregates multiple shared files per pair', () => {
    const detail = makeDetail(CHAIN, [
      { node_id: 'A', original_path: 'D:\\m\\geom.step' },
      { node_id: 'C', original_path: 'D:\\m\\geom.step' },
      { node_id: 'A', original_path: 'D:\\m\\mesh.msh' },
      { node_id: 'C', original_path: 'D:\\m\\mesh.msh' },
    ])
    const g = buildGraphData(detail)
    expect(g.sharedEdges).toHaveLength(1)
    expect(g.sharedEdges[0].count).toBe(2)
  })

  it('three nodes sharing one file produce all pairs, count 1 each', () => {
    const detail = makeDetail(CHAIN, [
      { node_id: 'A', original_path: 'D:\\m\\geom.step' },
      { node_id: 'B', original_path: 'D:\\m\\geom.step' },
      { node_id: 'C', original_path: 'D:\\m\\geom.step' },
    ])
    const g = buildGraphData(detail)
    expect(g.sharedEdges).toHaveLength(3) // A-B, A-C, B-C
    for (const e of g.sharedEdges) {
      expect(e.count).toBe(1)
      expect(e.kind).toBe('shared')
    }
    // 无关文件不产生共享边
    const single = makeDetail(CHAIN, [{ node_id: 'A', original_path: 'D:\\x\\only.out' }])
    expect(buildGraphData(single).sharedEdges).toHaveLength(0)
  })
})

describe('computeLayout 纵向分层（Q4：上游在上）', () => {
  it('places children below parents and returns full size', () => {
    const g = buildGraphData(makeDetail(CHAIN, []))
    const layout = computeLayout(g.nodes, g.derivesEdges)
    const a = layout.positions.get('A')!
    const b = layout.positions.get('B')!
    const c = layout.positions.get('C')!
    expect(a.y).toBeLessThan(b.y)
    expect(b.y).toBeLessThan(c.y)
    expect(layout.width).toBeGreaterThan(NODE_W)
    expect(layout.height).toBeGreaterThan(NODE_H)
  })
})
