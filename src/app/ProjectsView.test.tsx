import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import ProjectsView from './ProjectsView'
import { useProjects } from '../stores/projects'
import type { ProjectSummary } from '../lib/api'

vi.mock('../lib/api', () => ({
  listProjects: vi.fn(async () => [] as ProjectSummary[]),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  getProjectDetail: vi.fn(),
}))

const sample: ProjectSummary = {
  id: 'p1',
  name: '演示算例',
  note: '某翼型工况调试',
  created_at: '2026-08-31T10:00:00',
  updated_at: '2026-08-31T11:00:00',
  pending_count: 3,
}

describe('ProjectsView', () => {
  beforeEach(() => {
    useProjects.setState({ projects: [], loading: false, error: null, current: null })
  })

  it('renders projects with pending count badge', () => {
    useProjects.setState({ projects: [sample] })
    render(<ProjectsView />)
    expect(screen.getByText('演示算例')).toBeInTheDocument()
    expect(screen.getByText('待归档 3 项')).toBeInTheDocument()
    expect(screen.getByText('某翼型工况调试')).toBeInTheDocument()
  })

  it('shows empty state when no projects', () => {
    render(<ProjectsView />)
    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    expect(screen.getByText('还没有工程')).toBeInTheDocument()
  })

  it('shows error banner with retry on failure', () => {
    useProjects.setState({ error: '数据保存失败，请重试' })
    render(<ProjectsView />)
    expect(screen.getByRole('alert')).toHaveTextContent('数据保存失败，请重试')
  })
})
