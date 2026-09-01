import { useMemo, useState } from 'react'
import { useNodes, descendantsOf } from '../../stores/nodes'
import { useProjects } from '../../stores/projects'
import { Btn, Dialog, Field, inputStyle } from '../../components/ui'
import { STR } from '../../lib/strings'
import * as api from '../../lib/api'

/** 新建/编辑节点：name 必填；上游来源排除自身与自身下游（防环由后端兜底校验）。 */
export default function NodeEditDialog() {
  const { current, refreshCurrent } = useProjects()
  const { editingId, closeEditor, pendingParent } = useNodes()
  if (!current || !editingId) return null

  const isNew = editingId === '__new__'
  const nodes = current.nodes
  const editing = isNew ? null : nodes.find((n) => n.id === editingId) ?? null

  return (
    <Inner
      key={editingId}
      projectId={current.project.id}
      isNew={isNew}
      editing={editing}
      nodes={nodes}
      initialParent={isNew ? pendingParent ?? '' : editing?.parent_node_id ?? ''}
      onClose={closeEditor}
      onDone={async () => {
        closeEditor()
        await refreshCurrent()
      }}
    />
  )
}

function Inner(props: {
  projectId: string
  isNew: boolean
  editing: api.Node | null
  nodes: api.Node[]
  initialParent: string
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const { isNew, editing, nodes } = props
  const [name, setName] = useState(editing?.name ?? '')
  const [note, setNote] = useState(editing?.note ?? '')
  const [parent, setParent] = useState<string>(props.initialParent)
  const [error, setError] = useState<string | null>(null)

  const excluded = useMemo(
    () => (isNew || !editing ? new Set<string>() : descendantsOf(nodes, editing.id)),
    [nodes, editing, isNew],
  )
  const candidates = nodes.filter((n) => !excluded.has(n.id))

  const save = async () => {
    setError(null)
    try {
      if (isNew) {
        await api.createNode(props.projectId, name, note || null, parent || null)
      } else if (editing) {
        await api.updateNode(editing.id, name, note || null)
        const pid = parent || null
        if (pid !== (editing.parent_node_id ?? null)) {
          await api.setNodeParent(editing.id, pid)
        }
      }
      await props.onDone()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Dialog title={isNew ? STR.newNode : STR.editNode} onClose={props.onClose} width={480}>
      <Field label={STR.nodeName}>
        <input style={inputStyle} value={name} autoFocus maxLength={100} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={STR.nodeNote}>
        <textarea style={{ ...inputStyle, height: 72 }} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Field label={STR.nodeParent}>
        <select style={inputStyle} value={parent} onChange={(e) => setParent(e.target.value)}>
          <option value="">{STR.nodeParentNone}</option>
          {candidates.map((n) => (
            <option key={n.id} value={n.id}>{n.name}</option>
          ))}
        </select>
      </Field>
      {error && <div style={{ color: 'var(--c-danger)', marginBottom: 'var(--sp-3)' }}>{error}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)' }}>
        <Btn onClick={props.onClose}>{STR.cancel}</Btn>
        <Btn variant="primary" disabled={!name.trim()} onClick={save}>{STR.save}</Btn>
      </div>
    </Dialog>
  )
}
