import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReactFlowProvider } from '@xyflow/react'
import NodeBox from './NodeBox'
import FlowGraph, { resolveConnection } from './FlowGraph'
import { SharedEdge } from './SharedEdge'
import { useProjects } from '../../stores/projects'
import { useNodes } from '../../stores/nodes'
import type { FileEntry, Node, ProjectDetail } from '../../lib/api'

vi.mock('../../lib/api', () => ({
  setNodeParent: vi.fn(async () => ({})),
  createNode: vi.fn(),
  updateNode: vi.fn(),
  deleteNode: vi.fn(),
}))

function makeDetail(): ProjectDetail {
  const nodes: Node[] = [
    { id: 'A', project_id: 'p', name: '几何模型1', note: null, parent_node_id: null, created_at: 't1' },
    { id: 'B', project_id: 'p', name: '网格划分', note: null, parent_node_id: 'A', created_at: 't2' },
    { id: 'C', project_id: 'p', name: '求解', note: null, parent_node_id: 'B', created_at: 't3' },
    { id: 'D', project_id: 'p', name: '独立尝试', note: null, parent_node_id: null, created_at: 't4' },
  ]
  const entries: FileEntry[] = [
    { id: 'e1', project_id: 'p', node_id: 'A', original_path: 'D:\\r\\a1.out', file_name: 'a1.out', size_bytes: 100, registered_at: 't', validity: 'valid', archive_status: 'pending', last_archive_batch_id: null },
    { id: 'e2', project_id: 'p', node_id: 'A', original_path: 'D:\\r\\a2.out', file_name: 'a2.out', size_bytes: 50, registered_at: 't', validity: 'missing', archive_status: 'pending', last_archive_batch_id: null },
    { id: 'e3', project_id: 'p', node_id: 'C', original_path: 'D:\\r\\c1.out', file_name: 'c1.out', size_bytes: 30, registered_at: 't', validity: 'valid', archive_status: 'archived', last_archive_batch_id: null },
    { id: 'e4', project_id: 'p', node_id: 'C', original_path: 'D:\\r\\a1.out', file_name: 'a1.out', size_bytes: 100, registered_at: 't', validity: 'valid', archive_status: 'pending', last_archive_batch_id: null },
  ]
  return {
    project: { id: 'p', name: 'P', note: null, created_at: 't', updated_at: 't' },
    nodes,
    entries,
  }
}

const nodeBoxProps = (data: Record<string, unknown>, selected = false) =>
  ({
    id: 'x',
    type: 'nodebox',
    data,
    selected,
    zIndex: 0,
    isConnectable: true,
    draggable: false,
    dragging: false,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
  }) as unknown as Parameters<typeof NodeBox>[0]

describe('NodeBox（US1 摘要徽章 / FR-002 / FR-011）', () => {
  it('renders name, badges and footer counts', () => {
    const { container } = render(
      <ReactFlowProvider>
        <NodeBox
          {...nodeBoxProps({
            id: 'A',
            name: '几何模型1-第一次调试',
            note: null,
            createdAt: 't',
            total: 2,
            pending: 1,
            archived: 1,
            missing: 1,
            sizeBytes: 150,
          })}
        />
      </ReactFlowProvider>,
    )
    // 名称截断样式 + 悬停全名（FR-011）
    const name = container.querySelector('[data-testid="nodebox-name"]')!
    expect(name.getAttribute('title')).toBe('几何模型1-第一次调试')
    expect((name as HTMLElement).style.whiteSpace).toBe('nowrap')
    expect((name as HTMLElement).style.overflow).toBe('hidden')
    expect(screen.getByText('待归档 1')).toBeInTheDocument()
    expect(screen.getByText('已归档 1')).toBeInTheDocument()
    expect(screen.getByText('源失效 1')).toBeInTheDocument()
    expect(screen.getByText('2 项 · 150 B')).toBeInTheDocument()
  })

  it('shows selected highlight state', () => {
    const { container } = render(
      <ReactFlowProvider>
        <NodeBox {...nodeBoxProps({ id: 'A', name: 'A', note: null, createdAt: 't', total: 0, pending: 0, archived: 0, missing: 0, sizeBytes: 0 }, true)} />
      </ReactFlowProvider>,
    )
    expect(container.querySelector('.nodebox')?.getAttribute('data-selected')).toBe('true')
  })
})

describe('FlowGraph（US1 空状态与渲染 / FR-009）', () => {
  beforeEach(() => {
    useProjects.setState({ current: null, loading: false, error: null })
    useNodes.setState({ selectedNodeId: null, editingId: null, chainNodeId: null, deletingId: null, pendingParent: null })
  })

  it('renders empty state without canvas when project has no nodes', () => {
    useProjects.setState({ current: { project: { id: 'p', name: 'P', note: null, created_at: 't', updated_at: 't' }, nodes: [], entries: [] } })
    render(<FlowGraph />)
    expect(screen.getByText('还没有调试节点')).toBeInTheDocument()
    expect(document.querySelector('.react-flow')).toBeNull()
  })

  it('renders node boxes for a project', () => {
    useProjects.setState({ current: makeDetail() })
    render(<FlowGraph />)
    // 四个框（title 在根与名称元素上重复出现，用 getAllByTitle 断言存在）
    expect(screen.getAllByTitle('几何模型1').length).toBeGreaterThan(0)
    expect(screen.getAllByTitle('网格划分').length).toBeGreaterThan(0)
    expect(screen.getAllByTitle('求解').length).toBeGreaterThan(0)
    expect(screen.getAllByTitle('独立尝试').length).toBeGreaterThan(0)
    // 注：RF 的边渲染依赖真实尺寸测量（jsdom 中不触发），共享边标签的
    // 数据正确性由 graph.test.ts 覆盖，视觉呈现由 quickstart J 手动验收。
  })

  it('highlights the selected node from store (双向联动 / FR-007)', () => {
    useProjects.setState({ current: makeDetail() })
    useNodes.setState({ selectedNodeId: 'C' })
    const { container } = render(<FlowGraph />)
    const box = container.querySelector('.nodebox[data-selected="true"]')
    expect(box?.getAttribute('title')).toBe('求解')
  })
})

describe('resolveConnection（US3 画布连线语义 / FR-016）', () => {
  const nodes = [
    { id: 'A', parent_node_id: null },
    { id: 'B', parent_node_id: 'A' },
    { id: 'C', parent_node_id: 'B' },
  ]

  it('rejects dropping onto own descendant (成环)', () => {
    // 从 A 拖出落到 C：A 的来源改为 C → 成环，拒绝
    const r = resolveConnection(nodes, { source: 'A', target: 'C' })
    expect(r).toEqual({ ok: false, reason: 'cycle' })
    // 落到自身
    expect(resolveConnection(nodes, { source: 'A', target: 'A' })).toEqual({ ok: false, reason: 'invalid' })
  })

  it('allows re-parenting to an unrelated node', () => {
    // 从 C 拖出落到独立方向：C 的来源改为新上游
    const r = resolveConnection(nodes, { source: 'C', target: 'D1' })
    expect(r).toEqual({ ok: true, nodeId: 'C', parentId: 'D1' })
  })

  it('allows dropping onto own ancestor (改挂更上游)', () => {
    // 从 C 拖出落到 A：C 的来源改为 A（A 是祖先，不构成环）
    const r = resolveConnection(nodes, { source: 'C', target: 'A' })
    expect(r).toEqual({ ok: true, nodeId: 'C', parentId: 'A' })
  })

  it('rejects missing endpoints', () => {
    expect(resolveConnection(nodes, { source: 'A' })).toEqual({ ok: false, reason: 'invalid' })
  })
})
