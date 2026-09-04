import { describe, expect, it } from 'vitest'
import { buildGraphData, computeLayout, NODE_H, NODE_W, type GraphData } from './graph'
import { buildDiagramPlan } from './graph-diagram'
import type { ProjectDetail } from './api'

function makeDetail(): ProjectDetail {
  const nodes = [
    { id: 'A', project_id: 'p', name: '原始几何', note: null, parent_node_id: null, created_at: 't1' },
    { id: 'B', project_id: 'p', name: '网格划分', note: null, parent_node_id: 'A', created_at: 't2' },
    { id: 'C', project_id: 'p', name: '计算求解', note: null, parent_node_id: 'B', created_at: 't3' },
    { id: 'D', project_id: 'p', name: '独立尝试', note: null, parent_node_id: null, created_at: 't4' },
  ]
  const entries = [
    { id: 'e1', project_id: 'p', node_id: 'A', original_path: 'D:\\r\\geom.step', file_name: 'geom.step', size_bytes: 10240, registered_at: 't', validity: 'valid', archive_status: 'pending', last_archive_batch_id: null },
    { id: 'e2', project_id: 'p', node_id: 'A', original_path: 'D:\\r\\old.out', file_name: 'old.out', size_bytes: 2048, registered_at: 't', validity: 'valid', archive_status: 'archived', last_archive_batch_id: null },
    { id: 'e3', project_id: 'p', node_id: 'B', original_path: 'D:\\r\\mesh.msh', file_name: 'mesh.msh', size_bytes: 512, registered_at: 't', validity: 'missing', archive_status: 'pending', last_archive_batch_id: null },
    { id: 'e4', project_id: 'p', node_id: 'C', original_path: 'D:\\r\\res.dat', file_name: 'res.dat', size_bytes: 300, registered_at: 't', validity: 'valid', archive_status: 'pending', last_archive_batch_id: null },
    { id: 'e5', project_id: 'p', node_id: 'C', original_path: 'D:\\r\\geom.step', file_name: 'geom.step', size_bytes: 10240, registered_at: 't', validity: 'valid', archive_status: 'pending', last_archive_batch_id: null },
  ]
  return {
    project: { id: 'p', name: '演示算例', note: null, created_at: 't', updated_at: 't' },
    nodes,
    entries,
  }
}

function prepare(): { graph: GraphData; layout: ReturnType<typeof computeLayout> } {
  const graph = buildGraphData(makeDetail())
  const layout = computeLayout(graph.nodes, graph.derivesEdges)
  return { graph, layout }
}

describe('buildDiagramPlan（US1 绘制指令 / FR-003）', () => {
  it('creates one box per node with same-source badges and size text', () => {
    const { graph, layout } = prepare()
    const plan = buildDiagramPlan(graph, layout, { projectName: '演示算例', generatedAt: '2026-09-01T12:00:00' })
    expect(plan.boxes).toHaveLength(4)
    const a = plan.boxes.find((b) => b.name === '原始几何')!
    expect(a.total).toBe(2)
    expect(a.pending).toBe(1)
    expect(a.archived).toBe(1)
    expect(a.missing).toBe(0)
    expect(a.sizeText).toContain('KB')
    const b = plan.boxes.find((x) => x.name === '网格划分')!
    expect(b.missing).toBe(1)
    expect(b.sizeText).toContain('B')
  })

  it('arrows go top-down: child box below parent box (Q4 纵向)', () => {
    const { graph, layout } = prepare()
    const plan = buildDiagramPlan(graph, layout, { projectName: 'P', generatedAt: 't' })
    expect(plan.arrows).toHaveLength(2) // A→B, B→C
    const byId = new Map(plan.boxes.map((b) => [b.id, b]))
    for (const arrow of plan.arrows) {
      const from = byId.get(arrow.fromId)!
      const to = byId.get(arrow.toId)!
      expect(to.y).toBeGreaterThan(from.y)
      expect(arrow.points.length).toBeGreaterThanOrEqual(2)
      expect(arrow.points[0].y).toBe(from.y + from.h)
      expect(arrow.points[arrow.points.length - 1].y).toBe(to.y)
    }
  })

  it('shared links deduped per pair with counts', () => {
    const { graph, layout } = prepare()
    const plan = buildDiagramPlan(graph, layout, { projectName: 'P', generatedAt: 't' })
    expect(plan.sharedLinks).toHaveLength(1)
    expect(plan.sharedLinks[0].count).toBe(1)
    expect(new Set([plan.sharedLinks[0].aId, plan.sharedLinks[0].bId])).toEqual(new Set(['A', 'C']))
  })

  it('includes project title and generation timestamp', () => {
    const { graph, layout } = prepare()
    const plan = buildDiagramPlan(graph, layout, { projectName: '演示算例', generatedAt: '2026-09-01T12:00:00' })
    expect(plan.title).toContain('演示算例')
    expect(plan.title).toContain('流程图')
    expect(plan.generatedAt).toBe('2026-09-01T12:00:00')
  })

  it('canvas adapts to content (≥ layout size + title band)', () => {
    const { graph, layout } = prepare()
    const plan = buildDiagramPlan(graph, layout, { projectName: 'P', generatedAt: 't' })
    expect(plan.canvas.width).toBeGreaterThanOrEqual(layout.width)
    expect(plan.canvas.height).toBeGreaterThanOrEqual(layout.height)
    // 所有框都在画布内
    for (const b of plan.boxes) {
      expect(b.x).toBeGreaterThanOrEqual(0)
      expect(b.y).toBeGreaterThanOrEqual(0)
      expect(b.x + b.w).toBeLessThanOrEqual(plan.canvas.width)
      expect(b.y + b.h).toBeLessThanOrEqual(plan.canvas.height)
    }
    expect(NODE_W).toBeGreaterThan(0)
    expect(NODE_H).toBeGreaterThan(0)
  })

  it('empty project yields empty plan with title only', () => {
    const detail: ProjectDetail = {
      project: { id: 'p', name: '空工程', note: null, created_at: 't', updated_at: 't' },
      nodes: [],
      entries: [],
    }
    const graph = buildGraphData(detail)
    const layout = computeLayout(graph.nodes, graph.derivesEdges)
    const plan = buildDiagramPlan(graph, layout, { projectName: '空工程', generatedAt: 't' })
    expect(plan.boxes).toHaveLength(0)
    expect(plan.arrows).toHaveLength(0)
    expect(plan.title).toContain('空工程')
  })
})
