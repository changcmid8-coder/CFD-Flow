import { useState } from 'react'
import { Badge, Btn, EmptyState, ConfirmDialog } from '../../components/ui'
import { STR } from '../../lib/strings'
import { formatBytes, formatTime } from '../../lib/format'
import type { FileEntry } from '../../lib/api'

const ROW = 48

/** 登记文件列表：窗口化虚拟滚动（2000 行规模保持流畅，SC-007）。 */
export default function EntryList(props: {
  entries: FileEntry[]
  height: number
  onRemove: (entry: FileEntry) => void
  onReArchive: (entry: FileEntry) => void
}) {
  const { entries, height } = props
  const [scrollTop, setScrollTop] = useState(0)
  const [confirming, setConfirming] = useState<FileEntry | null>(null)

  if (entries.length === 0) {
    return (
      <EmptyState text={STR.emptyEntries} hint={STR.emptyEntriesHint} />
    )
  }

  const start = Math.max(0, Math.floor(scrollTop / ROW) - 6)
  const end = Math.min(entries.length, Math.ceil((scrollTop + height) / ROW) + 6)
  const visible = entries.slice(start, end)

  return (
    <div style={{ height, overflowY: 'auto' }} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
      <div style={{ height: entries.length * ROW, position: 'relative' }}>
        <div
          style={{
            position: 'sticky', top: 0, zIndex: 2, background: 'var(--c-surface)',
            display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
            padding: '0 var(--sp-3)', height: ROW, color: 'var(--c-text-3)', fontSize: 'var(--fs-s)',
            borderBottom: '1px solid var(--c-border)',
          }}
        >
          <span style={{ width: 26 }}>{'#'}</span>
          <span style={{ flex: 1 }}>{STR.colName}</span>
          <span style={{ width: 90 }}>{STR.colSize}</span>
          <span style={{ width: 110 }}>{STR.colTime}</span>
          <span style={{ width: 130 }}>{'状态'}</span>
        </div>
        {visible.map((entry, i) => {
          const idx = start + i
          return (
            <div
              key={entry.id}
              title={`${entry.original_path}`}
              style={{
                position: 'absolute', top: (idx + 1) * ROW, left: 0, right: 0, height: ROW,
                display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: '0 var(--sp-3)',
                borderBottom: '1px solid var(--c-border)', fontSize: 'var(--fs-m)',
              }}
            >
              <span style={{ width: 26, color: 'var(--c-text-3)' }}>{idx + 1}</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                {entry.file_name}
              </span>
              <span style={{ width: 90, color: 'var(--c-text-2)' }}>{formatBytes(entry.size_bytes)}</span>
              <span style={{ width: 110, color: 'var(--c-text-3)', fontSize: 'var(--fs-s)' }}>{formatTime(entry.registered_at)}</span>
              <span style={{ width: 130, display: 'flex', gap: 4, alignItems: 'center' }}>
                {entry.archive_status === 'archived' ? (
                  <Badge tone="ok" text={STR.badgeArchived} />
                ) : entry.validity === 'missing' ? (
                  <Badge tone="warn" text={STR.badgeMissing} />
                ) : (
                  <Badge tone="info" text="待归档" />
                )}
                {entry.archive_status === 'archived' && (
                  <Btn small onClick={() => props.onReArchive(entry)} title={STR.reArchive}>
                    {STR.reArchive}
                  </Btn>
                )}
              </span>
              <Btn small variant="danger" onClick={() => setConfirming(entry)} title={STR.removeEntry}>
                {STR.removeEntry}
              </Btn>
            </div>
          )
        })}
      </div>

      {confirming && (
        <ConfirmDialog
          title={STR.removeEntry}
          body={STR.removeEntryConfirm}
          danger
          okText={STR.removeEntry}
          onCancel={() => setConfirming(null)}
          onOk={() => {
            const e = confirming
            setConfirming(null)
            props.onRemove(e)
          }}
        />
      )}
    </div>
  )
}
