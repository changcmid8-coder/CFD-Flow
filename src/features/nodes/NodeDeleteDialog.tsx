import { useState } from 'react'
import { useNodes } from '../../stores/nodes'
import { useProjects } from '../../stores/projects'
import { Dialog, Btn, inputStyle } from '../../components/ui'
import { STR } from '../../lib/strings'
import * as api from '../../lib/api'

/** 删除节点：仍有登记时强制选择处置（移除登记 / 转移到其他节点），源文件不受影响。 */
export default function NodeDeleteDialog() {
  const { current, refreshCurrent } = useProjects()
  const { deletingId, startDelete, select, selectedNodeId } = useNodes()
  if (!current || !deletingId) return null

  const node = current.nodes.find((n) => n.id === deletingId)
  if (!node) return null
  const entryCount = current.entries.filter((e) => e.node_id === node.id).length

  return (
    <Inner
      key={node.id}
      nodeId={node.id}
      nodeName={node.name}
      entryCount={entryCount}
      nodes={current.nodes.filter((n) => n.id !== node.id)}
      onClose={() => startDelete(null)}
      onDone={async () => {
        const wasSelected = selectedNodeId === node.id
        startDelete(null)
        if (wasSelected) select(null)
        await refreshCurrent()
      }}
    />
  )
}

function Inner(props: {
  nodeId: string
  nodeName: string
  entryCount: number
  nodes: api.Node[]
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const [disposition, setDisposition] = useState<'remove_entries' | 'move_entries'>(
    props.entryCount > 0 ? 'move_entries' : 'remove_entries',
  )
  const [target, setTarget] = useState(props.nodes[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)

  const doDelete = async () => {
    setError(null)
    try {
      await api.deleteNode(
        props.nodeId,
        props.entryCount > 0 ? disposition : 'remove_entries',
        disposition === 'move_entries' ? target : null,
      )
      await props.onDone()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Dialog title={STR.deleteNode} onClose={props.onClose} width={480}>
      <div style={{ marginBottom: 'var(--sp-4)' }}>
        确定删除节点「{props.nodeName}」？
        <div style={{ color: 'var(--c-text-3)', marginTop: 6, fontSize: 'var(--fs-s)' }}>{STR.nodeDeleteSourceSafe}</div>
      </div>

      {props.entryCount > 0 && (
        <>
          <div style={{ marginBottom: 'var(--sp-2)', color: 'var(--c-text-2)' }}>{STR.nodeDeleteChoose}</div>
          <label style={{ display: 'block', marginBottom: 8 }}>
            <input type="radio" checked={disposition === 'move_entries'} onChange={() => setDisposition('move_entries')} />{' '}
            {STR.nodeDeleteMove}
          </label>
          {disposition === 'move_entries' && (
            <select style={{ ...inputStyle, marginBottom: 12 }} value={target} onChange={(e) => setTarget(e.target.value)}>
              {props.nodes.map((n) => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </select>
          )}
          <label style={{ display: 'block', marginBottom: 'var(--sp-4)' }}>
            <input type="radio" checked={disposition === 'remove_entries'} onChange={() => setDisposition('remove_entries')} />{' '}
            {STR.nodeDeleteRemove}
          </label>
        </>
      )}

      {error && <div style={{ color: 'var(--c-danger)', marginBottom: 'var(--sp-3)' }}>{error}</div>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)' }}>
        <Btn onClick={props.onClose}>{STR.cancel}</Btn>
        <Btn
          variant="danger"
          disabled={props.entryCount > 0 && disposition === 'move_entries' && !target}
          onClick={doDelete}
        >
          {STR.delete}
        </Btn>
      </div>
    </Dialog>
  )
}
