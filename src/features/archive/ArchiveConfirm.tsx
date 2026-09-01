import { useMemo, useState } from 'react'
import { useArchive, type ConflictPolicy } from '../../stores/archive'
import { useProjects } from '../../stores/projects'
import { Btn, Dialog, ErrorBanner, Field, inputStyle, Spinner } from '../../components/ui'
import { STR } from '../../lib/strings'
import { fill, formatBytes } from '../../lib/format'
import * as api from '../../lib/api'
import { open as openDir } from '@tauri-apps/plugin-dialog'

const LS_KEY = 'cfdflow.lastTargetRoot'

/** 归档确认页：汇总 + 按节点勾选排除 + 同名冲突三策略 + 磁盘空间预警（FR-007/FR-011）。 */
export default function ArchiveConfirm() {
  const { current, refreshCurrent } = useProjects()
  const st = useArchive()
  const [targetRoot, setTargetRoot] = useState(() => localStorage.getItem(LS_KEY) ?? '')
  const [starting, setStarting] = useState(false)

  const checkedItems = useMemo(
    () => (st.preview ? st.preview.items.filter((i) => st.checkedNodes.has(i.node_id)) : []),
    [st.preview, st.checkedNodes],
  )
  const checkedBytes = checkedItems.reduce((s, i) => s + i.current_size, 0)
  const missingCount = st.preview?.items.filter((i) => i.validity === 'missing').length ?? 0
  const diskLow =
    st.preview?.disk_free_bytes != null && st.preview.disk_free_bytes < checkedBytes

  // 按节点分组渲染（hooks 必须在 early return 之前，否则触发
  // "Rendered more hooks than during the previous render" 白屏）
  const groups = useMemo(() => {
    const m = new Map<string, api.PreviewItem[]>()
    for (const it of st.preview?.items ?? []) {
      const arr = m.get(it.node_id) ?? []
      arr.push(it)
      m.set(it.node_id, arr)
    }
    return [...m.entries()]
  }, [st.preview])

  if (st.phase !== 'confirm') return null

  const browse = async () => {
    const d = await openDir({ directory: true })
    if (typeof d === 'string' && d) {
      setTargetRoot(d)
      localStorage.setItem(LS_KEY, d)
    }
  }

  const recheck = () => {
    if (targetRoot.trim()) {
      localStorage.setItem(LS_KEY, targetRoot.trim())
      st.openConfirm(current!.project.id, targetRoot.trim())
    }
  }

  const start = async () => {
    if (!current) return
    setStarting(true)
    st.setError(null)
    try {
      const entryIds = checkedItems.map((i) => i.entry_id)
      const scope = checkedItems.length === (st.preview?.items.length ?? 0) ? 'all' : 'selected'
      const batchId = await api.executeArchive(
        current.project.id,
        targetRoot.trim(),
        entryIds,
        st.policies,
        scope,
      )
      st.setBatchId(batchId)
    } catch (e) {
      st.setError((e as Error).message)
    } finally {
      setStarting(false)
    }
  }

  return (
    <Dialog title={STR.archiveTitle} onClose={st.reset} width={680}>
      <Field label={STR.archiveTarget} hint="归档将按“目标目录/工程名/节点名/文件”两级结构组织">
        <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
          <input
            style={inputStyle}
            value={targetRoot}
            placeholder="例如 D:\\CFD-Archive"
            onChange={(e) => setTargetRoot(e.target.value)}
          />
          <Btn onClick={browse}>{STR.browse}</Btn>
          <Btn variant="soft" onClick={recheck} disabled={!targetRoot.trim()}>重新检查</Btn>
        </div>
      </Field>

      {st.loading && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'var(--c-text-2)', padding: 'var(--sp-3) 0' }}>
          <Spinner /> {STR.loading}
        </div>
      )}
      {st.error && <ErrorBanner text={st.error} onRetry={recheck} />}

      {st.preview && (
        <>
          {st.preview.items.length === 0 ? (
            <div style={{ color: 'var(--c-text-2)', padding: 'var(--sp-4) 0' }}>当前工程没有待归档的文件。</div>
          ) : (
            <>
              <div style={{ margin: 'var(--sp-2) 0 var(--sp-3)', fontWeight: 600 }}>
                {fill(STR.archiveSummary, { files: checkedItems.length, size: formatBytes(checkedBytes) })}
              </div>
              {missingCount > 0 && (
                <ErrorBanner text={fill(STR.noMissingWarn, { n: missingCount })} />
              )}
              {diskLow && (
                <ErrorBanner
                  text={fill(STR.diskWarning, {
                    free: formatBytes(st.preview.disk_free_bytes),
                    need: formatBytes(checkedBytes),
                  })}
                />
              )}
              <div style={{ color: 'var(--c-text-2)', margin: 'var(--sp-2) 0' }}>{STR.archiveByNode}</div>
              <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--c-border)', borderRadius: 'var(--radius-m)' }}>
                {groups.map(([nodeId, items]) => {
                  const nodeBytes = items.reduce((s, i) => s + i.current_size, 0)
                  const checked = st.checkedNodes.has(nodeId)
                  return (
                    <label
                      key={nodeId}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
                        padding: '8px var(--sp-3)', borderBottom: '1px solid var(--c-border)', cursor: 'pointer',
                      }}
                    >
                      <input type="checkbox" checked={checked} onChange={() => st.toggleNode(nodeId)} />
                      <span style={{ flex: 1 }}>{items[0].node_name}</span>
                      <span style={{ color: 'var(--c-text-3)', fontSize: 'var(--fs-s)' }}>
                        {items.length} 项 · {formatBytes(nodeBytes)}
                      </span>
                    </label>
                  )
                })}
              </div>

              {st.preview.conflicts.length > 0 && (
                <div style={{ marginTop: 'var(--sp-4)' }}>
                  <div style={{ fontWeight: 600, marginBottom: 'var(--sp-2)' }}>{STR.conflictsTitle}</div>
                  <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--c-border)', borderRadius: 'var(--radius-m)' }}>
                    {st.preview.conflicts.map((c) => (
                      <div
                        key={c.dest_path}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
                          padding: '6px var(--sp-3)', borderBottom: '1px solid var(--c-border)',
                        }}
                      >
                        <span style={{ flex: 1, fontSize: 'var(--fs-s)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.dest_path}>
                          {c.dest_path}
                        </span>
                        <select
                          style={{ ...inputStyle, width: 110 }}
                          value={st.policies[c.dest_path] ?? 'rename'}
                          onChange={(e) => st.setPolicy(c.dest_path, e.target.value as ConflictPolicy)}
                        >
                          <option value="skip">{STR.conflictSkip}</option>
                          <option value="overwrite">{STR.conflictOverwrite}</option>
                          <option value="rename">{STR.conflictRename}</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)', marginTop: 'var(--sp-5)' }}>
            <Btn onClick={st.reset}>{STR.cancel}</Btn>
            <Btn
              variant="primary"
              disabled={starting || checkedItems.length === 0 || !targetRoot.trim()}
              onClick={start}
            >
              {STR.startArchive}
            </Btn>
          </div>
        </>
      )}
    </Dialog>
  )
}
