import { useEffect, useState } from 'react'
import { useArchive } from '../../stores/archive'
import { useProjects } from '../../stores/projects'
import { Badge, Btn, Dialog, EmptyState, Spinner } from '../../components/ui'
import { STR } from '../../lib/strings'
import { formatBytes, formatTime } from '../../lib/format'
import * as api from '../../lib/api'

/** 归档历史：批次列表 + 明细查看。 */
export default function BatchHistory() {
  const { current } = useProjects()
  const st = useArchive()
  const [batches, setBatches] = useState<api.BatchSummary[] | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detail, setDetail] = useState<api.ArchiveResultItem[] | null>(null)

  useEffect(() => {
    if (!st.historyOpen || !current) return
    api.listArchiveBatches(current.project.id).then(setBatches).catch(() => setBatches([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.historyOpen])

  useEffect(() => {
    if (!detailId) {
      setDetail(null)
      return
    }
    api.listBatchResults(detailId).then(setDetail).catch(() => setDetail([]))
  }, [detailId])

  if (!st.historyOpen || !current) return null

  const statusBadge = (s: string) =>
    s === 'completed' ? (
      <Badge tone="ok" text={STR.batchStatusCompleted} />
    ) : s === 'cancelled' ? (
      <Badge tone="warn" text={STR.batchStatusCancelled} />
    ) : s === 'failed' ? (
      <Badge tone="err" text={STR.batchStatusFailed} />
    ) : (
      <Badge tone="info" text={STR.batchStatusRunning} />
    )

  return (
    <Dialog title={STR.archiveHistory} onClose={() => st.setHistoryOpen(false)} width={680}>
      {!batches ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Spinner /> {STR.loading}</div>
      ) : batches.length === 0 ? (
        <EmptyState text={STR.emptyBatches} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
          {batches.map((b) => (
            <div key={b.id} style={{ border: '1px solid var(--c-border)', borderRadius: 'var(--radius-m)', padding: 'var(--sp-3) var(--sp-4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                {statusBadge(b.status)}
                <span style={{ color: 'var(--c-text-3)', fontSize: 'var(--fs-s)' }}>{formatTime(b.started_at)}</span>
                <span style={{ flex: 1 }} />
                <span style={{ color: 'var(--c-text-2)', fontSize: 'var(--fs-s)' }}>
                  {b.copied} 成功 · {b.skipped} 跳过 · {b.failed} 失败 · {formatBytes(b.total_bytes)}
                </span>
                <Btn small onClick={() => setDetailId(detailId === b.id ? null : b.id)}>{STR.viewResults}</Btn>
              </div>
              <div style={{ color: 'var(--c-text-3)', fontSize: 'var(--fs-s)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.target_root}>
                {b.target_root}（{b.scope === 'all' ? '全部' : '按节点选择'}）
              </div>
              {detailId === b.id && (
                <div style={{ marginTop: 'var(--sp-2)', borderTop: '1px dashed var(--c-border)', paddingTop: 'var(--sp-2)' }}>
                  {!detail ? (
                    <Spinner size={14} />
                  ) : (
                    detail.map((r) => (
                      <div key={r.id} style={{ display: 'flex', gap: 8, fontSize: 'var(--fs-s)', padding: '3px 0' }}>
                        <span style={{ color: r.outcome === 'copied' ? 'var(--c-success)' : r.outcome === 'skipped' ? 'var(--c-warn)' : 'var(--c-danger)', width: 34 }}>
                          {r.outcome === 'copied' ? '成功' : r.outcome === 'skipped' ? '跳过' : '失败'}
                        </span>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.dest_path}>{r.dest_path}</span>
                        {r.detail && <span style={{ color: 'var(--c-text-3)' }}>{r.detail}</span>}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Dialog>
  )
}
