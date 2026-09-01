import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Badge } from '../../components/ui'
import { STR } from '../../lib/strings'
import { formatBytes } from '../../lib/format'
import { useNodes } from '../../stores/nodes'
import type { GraphNodeSummary } from '../../lib/graph'

/**
 * 流程框图的自定义节点框（US1）：名称截断（FR-011）、摘要徽章（FR-002）、
 * 顶部 target / 底部 source 句柄（纵向流向）、悬停操作与双击编辑（US3，FR-015/017/018）。
 */
function NodeBoxInner(props: NodeProps) {
  const d = props.data as unknown as GraphNodeSummary
  const selected = props.selected
  const startCreate = useNodes((s) => s.startCreate)
  const startDelete = useNodes((s) => s.startDelete)
  const startEdit = useNodes((s) => s.startEdit)
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()

  return (
    <div
      className="nodebox"
      data-selected={selected ? 'true' : 'false'}
      title={d.name}
      onDoubleClick={() => startEdit(d.id)}
      style={{
        width: 240,
        height: 96,
        background: 'var(--c-surface)',
        border: selected ? '2px solid var(--c-primary)' : '1px solid var(--c-border)',
        borderRadius: 'var(--radius-m)',
        boxShadow: selected ? 'var(--shadow-2)' : 'var(--shadow-1)',
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        transition: 'box-shadow var(--dur-1) var(--ease), border-color var(--dur-1) var(--ease)',
      }}
    >
      {/* 顶部 source：拖出以改挂来源（落点=新上游）；底部 target：接收下游连线。渲染边自上而下 */}
      <Handle type="source" position={Position.Top} />
      <Handle type="target" position={Position.Bottom} isConnectableStart={false} />

      <div
        data-testid="nodebox-name"
        title={d.name}
        style={{
          fontWeight: 600,
          fontSize: 'var(--fs-m)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {d.name}
      </div>

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', minHeight: 18 }}>
        {d.pending > 0 && <Badge tone="info" text={`待归档 ${d.pending}`} />}
        {d.archived > 0 && <Badge tone="ok" text={`已归档 ${d.archived}`} />}
        {d.missing > 0 && <Badge tone="warn" text={`源失效 ${d.missing}`} />}
        {d.total === 0 && <span style={{ color: 'var(--c-text-3)', fontSize: 'var(--fs-s)' }}>无登记文件</span>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: 'var(--c-text-3)', fontSize: 'var(--fs-s)', flex: 1 }}>
          {d.total} 项 · {formatBytes(d.sizeBytes)}
        </span>
        <span className="nodebox-actions" onClick={stop} onDoubleClick={stop} style={{ display: 'inline-flex', gap: 4 }}>
          <button
            type="button"
            aria-label={STR.createDownstream}
            title={STR.createDownstream}
            onClick={(e) => {
              e.stopPropagation()
              startCreate(d.id)
            }}
            style={actionBtnStyle}
          >
            ＋
          </button>
          <button
            type="button"
            aria-label={STR.deleteNode}
            title={STR.deleteNode}
            onClick={(e) => {
              e.stopPropagation()
              startDelete(d.id)
            }}
            style={{ ...actionBtnStyle, color: 'var(--c-danger)' }}
          >
            ✕
          </button>
        </span>
      </div>
    </div>
  )
}

const actionBtnStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 'var(--radius-s)',
  border: '1px solid var(--c-border)',
  background: 'var(--c-surface)',
  color: 'var(--c-text-2)',
  cursor: 'pointer',
  fontSize: 12,
  lineHeight: 1,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
}

export const NodeBox = memo(NodeBoxInner)
export default NodeBox
