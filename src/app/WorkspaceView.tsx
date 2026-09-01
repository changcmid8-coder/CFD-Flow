import { useEffect, useRef, useState } from 'react'
import { useProjects } from '../stores/projects'
import { useNodes } from '../stores/nodes'
import { useEntries } from '../stores/entries'
import { useArchive } from '../stores/archive'
import { useDragDrop } from '../features/entries/useDragDrop'
import NodeList from '../features/nodes/NodeList'
import NodeEditDialog from '../features/nodes/NodeEditDialog'
import ChainView from '../features/nodes/ChainView'
import NodeDeleteDialog from '../features/nodes/NodeDeleteDialog'
import EntryList from '../features/entries/EntryList'
import ArchiveConfirm from '../features/archive/ArchiveConfirm'
import ArchiveProgress from '../features/archive/ArchiveProgress'
import ArchiveResult from '../features/archive/ArchiveResult'
import BatchHistory from '../features/archive/BatchHistory'
import ReArchiveDialog from '../features/archive/ReArchiveDialog'
import { Badge, Btn, EmptyState, Toast } from '../components/ui'
import { STR } from '../lib/strings'
import { fill, formatBytes } from '../lib/format'
import FlowGraph from '../features/graph/FlowGraph'
import type { FileEntry } from '../lib/api'

/** 工作台：左节点树（拖拽落点）+ 右登记列表 + 归档流程浮层。 */
export default function WorkspaceView() {
  const { current, close, refreshCurrent } = useProjects()
  const { selectedNodeId, startCreate } = useNodes()
  const entriesSt = useEntries()
  const archiveSt = useArchive()
  const [reArchiveEntry, setReArchiveEntry] = useState<FileEntry | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const [listH, setListH] = useState(420)

  useEffect(() => {
    const measure = () => {
      if (listRef.current) setListH(listRef.current.clientHeight)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [selectedNodeId])

  useDragDrop((paths, nodeId) => {
    void entriesSt.register(nodeId, paths, refreshCurrent)
  })

  if (!current) return null
  const selected = current.nodes.find((n) => n.id === selectedNodeId) ?? null
  const nodeEntries = selected ? current.entries.filter((e) => e.node_id === selected.id) : []
  const pendingTotal = current.entries.filter((e) => e.archive_status === 'pending').length

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
          padding: 'var(--sp-3) var(--sp-5)', borderBottom: '1px solid var(--c-border)',
          background: 'var(--c-surface)',
        }}
      >
        <Btn small onClick={close}>{STR.back}</Btn>
        <div style={{ fontSize: 'var(--fs-l)', fontWeight: 600, flex: 1 }}>{current.project.name}</div>
        {pendingTotal > 0 && <Badge tone="info" text={fill(STR.pendingCount, { n: pendingTotal })} />}
        <Btn onClick={() => archiveSt.setHistoryOpen(true)}>{STR.archiveHistory}</Btn>
        <Btn variant="primary" onClick={() => archiveSt.openConfirm(current.project.id, localStorage.getItem('cfdflow.lastTargetRoot') ?? '')}>
          {STR.archive}
        </Btn>
      </header>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <section
          style={{
            width: '44%',
            minWidth: 380,
            borderRight: '1px solid var(--c-border)',
            overflow: 'hidden',
          }}
        >
          <FlowGraph />
        </section>
        <aside
          style={{
            width: 300, borderRight: '1px solid var(--c-border)', background: 'var(--c-surface)',
            display: 'flex', flexDirection: 'column', minHeight: 0,
          }}
        >
          <NodeList />
        </aside>
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--c-surface)' }}>
          {selected ? (
            <>
              <div
                style={{
                  padding: 'var(--sp-3) var(--sp-4)', borderBottom: '1px solid var(--c-border)',
                  display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
                }}
              >
                <div style={{ fontWeight: 600 }}>{selected.name}</div>
                <span style={{ color: 'var(--c-text-3)', fontSize: 'var(--fs-s)' }}>
                  {nodeEntries.length} 项 · {formatBytes(nodeEntries.reduce((s, e) => s + e.size_bytes, 0))}
                </span>
              </div>
              <div ref={listRef} style={{ flex: 1, minHeight: 0, background: 'var(--c-surface)' }}>
                <EntryList
                  entries={nodeEntries}
                  height={Math.max(listH, 200)}
                  onRemove={(e) => void entriesSt.remove(e.id, refreshCurrent)}
                  onReArchive={(e) => setReArchiveEntry(e)}
                />
              </div>
            </>
          ) : (
            <EmptyState text={STR.dropHint} hint={STR.emptyNodesHint} action={<Btn variant="soft" onClick={startCreate}>{STR.newNode}</Btn>} />
          )}
        </main>
      </div>

      {/* 浮层 */}
      <NodeEditDialog />
      <NodeDeleteDialog />
      <ChainView />
      <ArchiveConfirm />
      <ArchiveProgress />
      <ArchiveResult />
      <BatchHistory />
      <ReArchiveDialog entry={reArchiveEntry} onClose={() => setReArchiveEntry(null)} />

      {entriesSt.toast && (
        <Toast kind={entriesSt.toast.kind} text={entriesSt.toast.text} onClose={() => entriesSt.setToast(null)} />
      )}
      {archiveSt.notice && (
        <Toast kind={archiveSt.notice.kind} text={archiveSt.notice.text} onClose={() => archiveSt.setNotice(null)} />
      )}
    </div>
  )
}
