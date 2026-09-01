import { useNodes, upstreamChain, downstreamOf } from '../../stores/nodes'
import { useProjects } from '../../stores/projects'
import { Dialog } from '../../components/ui'
import { STR } from '../../lib/strings'
import { fill, formatTime } from '../../lib/format'

/** 调试链视图：从任一节点回溯完整来源链，并列出直接后续尝试。 */
export default function ChainView() {
  const { current } = useProjects()
  const { chainNodeId, showChain } = useNodes()
  if (!current || !chainNodeId) return null

  const chain = upstreamChain(current.nodes, chainNodeId)
  const downstream = downstreamOf(current.nodes, chainNodeId)

  return (
    <Dialog title={STR.chainView} onClose={() => showChain(null)} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {chain.map((n, i) => (
          <div key={n.id}>
            {i > 0 && (
              <div style={{ color: 'var(--c-text-3)', padding: '2px 0 2px 14px', fontSize: 'var(--fs-s)' }}>
                ↓ {STR.derivedFrom}
              </div>
            )}
            <div
              style={{
                background: i === chain.length - 1 ? 'var(--c-primary-soft)' : 'var(--c-surface-2)',
                borderRadius: 'var(--radius-m)', padding: 'var(--sp-3) var(--sp-4)',
                border: '1px solid var(--c-border)',
              }}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <div style={{ fontWeight: 600 }}>{n.name}</div>
                <div style={{ color: 'var(--c-text-3)', fontSize: 'var(--fs-s)' }}>{formatTime(n.created_at)}</div>
              </div>
              {n.note && <div style={{ color: 'var(--c-text-2)', marginTop: 4, fontSize: 'var(--fs-m)' }}>{n.note}</div>}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 'var(--sp-4)' }}>
        <div style={{ color: 'var(--c-text-2)', marginBottom: 6, fontSize: 'var(--fs-m)' }}>
          {downstream.length ? fill(STR.derivedCount, { n: downstream.length }) : ''}
        </div>
        {downstream.map((n) => (
          <div key={n.id} style={{ padding: '6px var(--sp-3)', background: 'var(--c-surface-2)', borderRadius: 'var(--radius-s)', marginBottom: 4 }}>
            {n.name}
          </div>
        ))}
      </div>
    </Dialog>
  )
}
