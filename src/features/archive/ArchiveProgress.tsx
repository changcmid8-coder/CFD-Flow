import { useArchive } from '../../stores/archive'
import { Btn, Dialog, ProgressBar, Spinner } from '../../components/ui'
import { STR } from '../../lib/strings'
import { fill, formatBytes } from '../../lib/format'
import * as api from '../../lib/api'

/** 归档进度：字节/文件双计数 + 当前文件 + 取消（取消即清理 .part，FR-009）。 */
export default function ArchiveProgress() {
  const st = useArchive()
  if (st.phase !== 'progress') return null

  const p = st.progress
  const ratio = p && p.total_bytes > 0 ? p.done_bytes / p.total_bytes : 0

  return (
    <Dialog title={STR.archiveProgress} width={520}>
      {!p ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'var(--c-text-2)' }}>
          <Spinner /> {STR.loading}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--sp-2)' }}>
            <span style={{ color: 'var(--c-text-2)' }}>
              {p.phase === 'finishing' ? STR.phaseFinishing : STR.phaseCopying}
            </span>
            <span>{`${formatBytes(p.done_bytes)} / ${formatBytes(p.total_bytes)}`}</span>
          </div>
          <ProgressBar value={ratio} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'var(--sp-2)', color: 'var(--c-text-3)', fontSize: 'var(--fs-s)' }}>
            <span>{fill('文件 {a} / {b}', { a: p.done_files, b: p.total_files })}</span>
            <span title={p.current_file} style={{ maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.current_file}
            </span>
          </div>
          {p.phase !== 'finishing' && (
            <div style={{ marginTop: 'var(--sp-5)', display: 'flex', justifyContent: 'flex-end' }}>
              <Btn variant="danger" onClick={() => api.cancelArchive(st.batchId!)}>{STR.cancelArchive}</Btn>
            </div>
          )}
          <div style={{ color: 'var(--c-text-3)', fontSize: 'var(--fs-s)', marginTop: 'var(--sp-2)' }}>
            {STR.cancelArchiveHint}
          </div>
        </>
      )}
    </Dialog>
  )
}
