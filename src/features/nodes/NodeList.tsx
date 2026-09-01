import { useNodes, descendantsOf } from '../../stores/nodes'
import { useProjects } from '../../stores/projects'
import { useEntries } from '../../stores/entries'
import { Btn, EmptyState, Spinner } from '../../components/ui'
import { LayersIcon } from '../../components/icons'
import { STR } from '../../lib/strings'
import { open as openFileDialog } from '@tauri-apps/plugin-dialog'

/** 左侧调试节点列表：拖拽登记的落点（data-node-id 供命中判定）。 */
export default function NodeList() {
  const { current, refreshCurrent } = useProjects()
  const { selectedNodeId, hoveredNodeId, select, startCreate, startEdit, showChain, startDelete } = useNodes()
  const { register, registering } = useEntries()
  if (!current) return null

  const { nodes, entries } = current

  const pickFiles = async (nodeId: string) => {
    const picked = await openFileDialog({ multiple: true })
    if (!picked) return
    const paths = Array.isArray(picked) ? picked : [picked]
    if (paths.length) await register(nodeId, paths, refreshCurrent)
  }

  const pickFolder = async (nodeId: string) => {
    const picked = await openFileDialog({ directory: true })
    if (!picked) return
    await register(nodeId, [picked as string], refreshCurrent)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: 'var(--sp-3) var(--sp-4)', gap: 'var(--sp-2)' }}>
        <div style={{ fontWeight: 600, flex: 1 }}>{STR.nodesTitle}</div>
        <Btn small variant="soft" onClick={startCreate}>{STR.newNode}</Btn>
      </div>

      {registering && (
        <div style={{ padding: 'var(--sp-2) var(--sp-4)', color: 'var(--c-text-2)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <Spinner size={14} /> {STR.registering}
        </div>
      )}

      {nodes.length === 0 ? (
        <EmptyState
          icon={<LayersIcon size={36} />}
          text={STR.emptyNodes}
          hint={STR.emptyNodesHint}
          action={<Btn variant="soft" onClick={startCreate}>{STR.newNode}</Btn>}
        />
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--sp-2) var(--sp-3)' }}>
          {nodes.map((n) => {
            const nodeEntries = entries.filter((e) => e.node_id === n.id)
            const pending = nodeEntries.filter((e) => e.archive_status === 'pending').length
            const archived = nodeEntries.length - pending
            const selected = selectedNodeId === n.id
            const hovered = hoveredNodeId === n.id
            return (
              <div
                key={n.id}
                data-node-id={n.id}
                role="button"
                tabIndex={0}
                aria-label={`选择节点 ${n.name}`}
                onClick={() => select(n.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') select(n.id)
                }}
                style={{
                  padding: '10px var(--sp-3)', borderRadius: 'var(--radius-m)', marginBottom: 4, cursor: 'pointer',
                  background: selected ? 'var(--c-primary-soft)' : hovered ? 'var(--c-surface-2)' : 'transparent',
                  border: selected ? '1px solid var(--c-primary)' : '1px solid transparent',
                  transition: 'background var(--dur-1) var(--ease)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {n.name}
                  </div>
                  {pending > 0 && <span style={{ fontSize: 'var(--fs-s)', color: 'var(--c-primary)' }}>{pending}</span>}
                  {archived > 0 && <span style={{ fontSize: 'var(--fs-s)', color: 'var(--c-success)' }}>✓{archived}</span>}
                </div>
                {n.note && (
                  <div style={{ color: 'var(--c-text-3)', fontSize: 'var(--fs-s)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {n.note}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 4, marginTop: 8 }}>
                  <Btn small onClick={() => pickFiles(n.id)} title={STR.registerPick}>{STR.registerPick}</Btn>
                  <Btn small onClick={() => pickFolder(n.id)}>{STR.registerPickFolder}</Btn>
                  <Btn small onClick={() => showChain(n.id)}>{STR.chainView}</Btn>
                  <Btn small onClick={() => startEdit(n.id)}>{STR.editNode}</Btn>
                  <Btn small variant="danger" onClick={() => startDelete(n.id)}>{STR.deleteNode}</Btn>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export { descendantsOf }
