import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import EntryList from './EntryList'
import type { FileEntry } from '../../lib/api'

function makeEntries(n: number): FileEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `e${i}`,
    project_id: 'p',
    node_id: 'n1',
    original_path: `D:\\res\\f${String(i).padStart(3, '0')}.dat`,
    file_name: `f${String(i).padStart(3, '0')}.dat`,
    size_bytes: 1024 * (i + 1),
    registered_at: '2026-08-31T10:00:00',
    validity: 'valid',
    archive_status: 'pending',
    last_archive_batch_id: null,
  }))
}

describe('EntryList 虚拟滚动', () => {
  it('renders header and empty state', () => {
    render(<EntryList entries={[]} height={400} onRemove={vi.fn()} onReArchive={vi.fn()} />)
    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
  })

  it('virtualizes large lists: early rows rendered, far rows not', () => {
    const entries = makeEntries(2000)
    render(<EntryList entries={entries} height={480} onRemove={vi.fn()} onReArchive={vi.fn()} />)
    // 表头与首屏行可见
    expect(screen.getByText('文件名')).toBeInTheDocument()
    expect(screen.getByText('f000.dat')).toBeInTheDocument()
    // 虚拟化：远端行未渲染（首屏窗口约 10 行 + 余量）
    expect(screen.queryByText('f1900.dat')).not.toBeInTheDocument()
    // 渲染的行数远小于总行数（窗口化生效）
    const rendered = document.querySelectorAll('[title^="D:\\\\res\\\\"]').length
    expect(rendered).toBeLessThan(60)
    expect(rendered).toBeGreaterThan(0)
  })

  it('shows validity and archive badges', () => {
    const entries = makeEntries(2)
    entries[0].validity = 'missing'
    entries[1].archive_status = 'archived'
    render(<EntryList entries={entries} height={480} onRemove={vi.fn()} onReArchive={vi.fn()} />)
    expect(screen.getByText('源失效')).toBeInTheDocument()
    expect(screen.getByText('已归档')).toBeInTheDocument()
  })
})
