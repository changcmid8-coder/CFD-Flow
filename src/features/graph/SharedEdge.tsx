import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@xyflow/react'
import { STR } from '../../lib/strings'
import { fill } from '../../lib/format'

/**
 * 共享文件边（US4 / FR-006）：虚线 + warn 色系，与"来源于"实线箭头视觉可区分；
 * 标签显示共享计数，悬停列出共享文件名。
 */
export function SharedEdge(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, id, data } = props
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 14,
  })
  const d = (data ?? {}) as { count?: number; files?: string[] }
  const label = fill(STR.sharedCount, { n: d.count ?? 0 })
  const tip = fill(STR.sharedTooltip, { files: (d.files ?? []).join('、') })
  const midX = (sourceX + targetX) / 2
  const midY = (sourceY + targetY) / 2
  return (
    <>
      <BaseEdge id={id} path={path} style={{ stroke: 'var(--c-warn)', strokeWidth: 1.4, strokeDasharray: '6 4' }} />
      <EdgeLabelRenderer>
        <span
          className="shared-edge-label"
          title={tip}
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${midX}px, ${midY}px)`,
          }}
        >
          {label}
        </span>
      </EdgeLabelRenderer>
    </>
  )
}

export default SharedEdge
