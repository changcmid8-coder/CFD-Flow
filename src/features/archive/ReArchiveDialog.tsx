import { useState } from 'react'
import { useProjects } from '../../stores/projects'
import { useArchive } from '../../stores/archive'
import { Btn, Dialog, Field, inputStyle } from '../../components/ui'
import { STR } from '../../lib/strings'
import { formatBytes } from '../../lib/format'
import * as api from '../../lib/api'
import { open as openDir } from '@tauri-apps/plugin-dialog'
import type { FileEntry } from '../../lib/api'

const LS_KEY = 'cfdflow.lastTargetRoot'

/** 已归档登记项的"再次归档"：复制到另一目录；同名冲突默认安全重命名（FR-019）。 */
export default function ReArchiveDialog(props: { entry: FileEntry | null; onClose: () => void }) {
  const { current, refreshCurrent } = useProjects()
  const st = useArchive()
  const [targetRoot, setTargetRoot] = useState(() => localStorage.getItem(LS_KEY) ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!props.entry || !current) return null
  const entry = props.entry

  const browse = async () => {
    const d = await openDir({ directory: true })
    if (typeof d === 'string' && d) {
      setTargetRoot(d)
      localStorage.setItem(LS_KEY, d)
    }
  }

  const start = async () => {
    setBusy(true)
    setError(null)
    try {
      const batchId = await api.executeArchive(current.project.id, targetRoot.trim(), [entry.id], {}, 'selected')
      localStorage.setItem(LS_KEY, targetRoot.trim())
      props.onClose()
      st.setBatchId(batchId)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title={STR.reArchive} onClose={props.onClose} width={480}>
      <div style={{ marginBottom: 'var(--sp-4)', color: 'var(--c-text-2)' }}>
        {entry.file_name}（{formatBytes(entry.size_bytes)}）将复制到新的目标目录；目标已存在同名文件时自动重命名，不会覆盖。
      </div>
      <Field label={STR.archiveTarget}>
        <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
          <input style={inputStyle} value={targetRoot} onChange={(e) => setTargetRoot(e.target.value)} />
          <Btn onClick={browse}>{STR.browse}</Btn>
        </div>
      </Field>
      {error && <div style={{ color: 'var(--c-danger)', marginBottom: 'var(--sp-3)' }}>{error}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)' }}>
        <Btn onClick={props.onClose}>{STR.cancel}</Btn>
        <Btn variant="primary" disabled={busy || !targetRoot.trim()} onClick={start}>
          {STR.startArchive}
        </Btn>
      </div>
    </Dialog>
  )
}
