import { useEffect, useState } from 'react'
import { useArchive } from '../../stores/archive'
import { useProjects } from '../../stores/projects'
import { Badge, Btn, ConfirmDialog, Dialog, Spinner } from '../../components/ui'
import { STR } from '../../lib/strings'
import { fill, formatBytes } from '../../lib/format'
import * as api from '../../lib/api'

/**
 * 归档结果：成功/跳过/失败明细（FR-013）+ 源文件处置询问（保留 / 删除需二次确认，FR-012）。
 */
export default function ArchiveResult() {
  const { refreshCurrent } = useProjects()
  const st = useArchive()
  const [results, setResults] = useState<api.ArchiveResultItem[] | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [dispositionBusy, setDispositionBusy] = useState(false)

  const final = st.final
  const batchId = final?.batch_id
  // 关闭结果页即刷新：归档/取消后节点框摘要立即与数据一致（US2 联动）
  const close = () => {
    st.reset()
    void refreshCurrent()
  }

  useEffect(() => {
    if (st.phase !== 'result' || !batchId) return
    let alive = true
    api.listBatchResults(batchId).then((r) => {
      if (alive) setResults(r)
    }).catch(() => setResults([]))
    return () => {
      alive = false
    }
  }, [st.phase, batchId])

  if (st.phase !== 'result' || !final) return null

  const failedItems = results?.filter((r) => r.outcome === 'failed') ?? []

  return (
    <Dialog title={STR.archiveResult} onClose={st.reset} width={640}>
      <div style={{ display: 'flex', gap: 'var(--sp-3)', marginBottom: 'var(--sp-4)', alignItems: 'center' }}>
        <Badge tone={final.status === 'completed' ? 'ok' : final.status === 'cancelled' ? 'warn' : 'err'}
          text={final.status === 'completed' ? STR.batchStatusCompleted : final.status === 'cancelled' ? STR.batchStatusCancelled : STR.batchStatusFailed}
        />
        <span style={{ color: 'var(--c-text-2)' }}>
          {fill(STR.resultCopied, { n: final.copied })} · {fill(STR.resultSkipped, { n: final.skipped })} ·{' '}
          {fill(STR.resultFailed, { n: final.failed })} · {formatBytes(final.copied_bytes)}
        </span>
      </div>

      {!results ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Spinner /> {STR.loading}</div>
      ) : (
        <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--c-border)', borderRadius: 'var(--radius-m)' }}>
          {results.length === 0 && <div style={{ padding: 'var(--sp-3)', color: 'var(--c-text-3)' }}>无明细</div>}
          {results.map((r) => (
            <div key={r.id} style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', padding: '6px var(--sp-3)', borderBottom: '1px solid var(--c-border)' }}>
              <Badge tone={r.outcome === 'copied' ? 'ok' : r.outcome === 'skipped' ? 'warn' : 'err'}
                text={r.outcome === 'copied' ? '成功' : r.outcome === 'skipped' ? '跳过' : '失败'}
              />
              <span style={{ flex: 1, fontSize: 'var(--fs-s)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.dest_path}>
                {r.dest_path}
              </span>
              {r.detail && <span style={{ color: 'var(--c-danger)', fontSize: 'var(--fs-s)', maxWidth: '40%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.detail}>{r.detail}</span>}
            </div>
          ))}
        </div>
      )}

      {st.disposition && final.status === 'completed' && (
        <div
          style={{
            marginTop: 'var(--sp-4)', padding: 'var(--sp-4)', borderRadius: 'var(--radius-m)',
            background: 'var(--c-surface-2)',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 'var(--sp-2)' }}>是否保留源文件？</div>
          <div style={{ color: 'var(--c-text-2)', fontSize: 'var(--fs-m)', marginBottom: 'var(--sp-3)' }}>
            {fill('本次已成功归档 {n} 个文件。保留则源文件原样不动；删除则从磁盘移除这些源文件。', { n: st.disposition.copied })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)' }}>
            <Btn
              disabled={dispositionBusy}
              onClick={async () => {
                setDispositionBusy(true)
                await st.runDisposition(true, refreshCurrent)
                setDispositionBusy(false)
              }}
            >
              {STR.keepSources}
            </Btn>
            <Btn variant="danger" disabled={dispositionBusy} onClick={() => setConfirmDelete(true)}>
              {STR.deleteSources}
            </Btn>
          </div>
        </div>
      )}

      {st.notice && (
        <div style={{ marginTop: 'var(--sp-3)', color: st.notice.kind === 'err' ? 'var(--c-danger)' : 'var(--c-text-2)' }}>
          {st.notice.text}
        </div>
      )}
      {failedItems.length > 0 && !st.disposition && (
        <div style={{ marginTop: 'var(--sp-3)', color: 'var(--c-warn)', fontSize: 'var(--fs-s)' }}>
          {fill(STR.dispositionFailed, { n: failedItems.length })}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--sp-4)' }}>
        <Btn variant="primary" onClick={close}>{STR.close}</Btn>
      </div>

      {confirmDelete && st.disposition && (
        <ConfirmDialog
          title={STR.deleteSources}
          body={fill(STR.deleteSourcesConfirm, { n: st.disposition.copied })}
          danger
          okText={STR.deleteSources}
          onCancel={() => setConfirmDelete(false)}
          onOk={async () => {
            setConfirmDelete(false)
            setDispositionBusy(true)
            await st.runDisposition(false, refreshCurrent)
            setDispositionBusy(false)
          }}
        />
      )}
    </Dialog>
  )
}
