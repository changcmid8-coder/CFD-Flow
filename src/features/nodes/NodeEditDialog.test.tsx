import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import NodeEditDialog from './NodeEditDialog'
import { useProjects } from '../../stores/projects'
import { useNodes } from '../../stores/nodes'
import type { ProjectDetail } from '../../lib/api'

vi.mock('../../lib/api', () => ({
  createNode: vi.fn(async (_pid: string, name: string) => ({
    id: 'new1', project_id: 'p', name, note: null, parent_node_id: null, created_at: 't',
  })),
  updateNode: vi.fn(),
  setNodeParent: vi.fn(),
  deleteNode: vi.fn(),
}))

function makeDetail(): ProjectDetail {
  return {
    project: { id: 'p', name: 'P', note: null, created_at: 't', updated_at: 't' },
    nodes: [
      { id: 'A', project_id: 'p', name: '原始几何', note: null, parent_node_id: null, created_at: 't1' },
      { id: 'B', project_id: 'p', name: '计算调试V1', note: null, parent_node_id: 'A', created_at: 't2' },
    ],
    entries: [],
  }
}

describe('NodeEditDialog 预设 chips（US2 / FR-006~009）', () => {
  beforeEach(() => {
    useProjects.setState({ current: makeDetail(), loading: false, error: null })
    useNodes.setState({ editingId: null, pendingParent: null, chainNodeId: null, deletingId: null, selectedNodeId: null, hoveredNodeId: null })
  })

  it('renders preset chips including the five typical presets', () => {
    useNodes.setState({ editingId: '__new__', pendingParent: null })
    render(<NodeEditDialog />)
    for (const p of ['参考文献', '原始几何', '网格划分', '计算求解', '后处理']) {
      expect(screen.getByRole('button', { name: p })).toBeInTheDocument()
    }
  })

  it('fills name on preset click and keeps prefilled parent unchanged', () => {
    useNodes.setState({ editingId: '__new__', pendingParent: 'A' })
    render(<NodeEditDialog />)
    const nameInput = screen.getByLabelText('节点名称') as HTMLInputElement
    expect(nameInput.value).toBe('')
    fireEvent.click(screen.getByRole('button', { name: '网格划分' }))
    expect((screen.getByLabelText('节点名称') as HTMLInputElement).value).toBe('网格划分')
    // 来源预填不被预设破坏（FR-007）
    const parentSelect = screen.getByLabelText('来源于（可选）') as HTMLSelectElement
    expect(parentSelect.value).toBe('A')
  })

  it('allows editing the preset-filled name before save (FR-009)', () => {
    useNodes.setState({ editingId: '__new__', pendingParent: null })
    render(<NodeEditDialog />)
    fireEvent.click(screen.getByRole('button', { name: '原始几何' }))
    const nameInput = screen.getByLabelText('节点名称') as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: '原始几何V2' } })
    expect(nameInput.value).toBe('原始几何V2')
  })
})
