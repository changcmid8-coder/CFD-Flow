import { useCallback, useMemo } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  type EdgeTypes,
} from '@xyflow/react'
import { useProjects } from '../../stores/projects'
import { useNodes, descendantsOf } from '../../stores/nodes'
import { useEntries } from '../../stores/entries'
import { buildGraphData, computeLayout, pairKey } from '../../lib/graph'
import { NodeBox } from './NodeBox'
import { SharedEdge } from './SharedEdge'
import { Btn, EmptyState } from '../../components/ui'
import { LayersIcon } from '../../components/icons'
import { STR } from '../../lib/strings'
import * as api from '../../lib/api'

const nodeTypes: NodeTypes = { nodebox: NodeBox }
const edgeTypes: EdgeTypes = { shared: SharedEdge }

/**
 * 画布连线语义（与 spec 场景 I 一致）：拖出框 = 要改来源的节点，落点框 = 新上游。
 * 防环：新上游不得是拖出框自身或其下游（否则成环）。
 */
export type ConnectResolution =
  | { ok: true; nodeId: string; parentId: string }
  | { ok: false; reason: 'invalid' | 'cycle' }

export function resolveConnection(
  nodes: Array<{ id: string; parent_node_id: string | null }>,
  c: { source?: string | null; target?: string | null },
): ConnectResolution {
  if (!c.source || !c.target || c.source === c.target) return { ok: false, reason: 'invalid' }
  if (descendantsOf(nodes, c.source).has(c.target)) return { ok: false, reason: 'cycle' }
  return { ok: true, nodeId: c.source, parentId: c.target }
}

function FlowGraphInner() {
  const current = useProjects((s) => s.current)
  const refreshCurrent = useProjects((s) => s.refreshCurrent)
  const selectedNodeId = useNodes((s) => s.selectedNodeId)
  const select = useNodes((s) => s.select)
  const startCreate = useNodes((s) => s.startCreate)
  const setToast = useEntries((s) => s.setToast)

  // 单一事实源：任何 store 数据变更 → 派生重算 → 框图 1s 内一致（FR-005/FR-013）
  const graph = useMemo(() => (current ? buildGraphData(current) : null), [current])
  const layout = useMemo(() => (graph ? computeLayout(graph.nodes, graph.derivesEdges) : null), [graph])

  const rfNodes = useMemo<Node[]>(() => {
    if (!graph || !layout) return []
    return graph.nodes.map((n) => ({
      id: n.id,
      type: 'nodebox',
      position: layout.positions.get(n.id) ?? { x: 0, y: 0 },
      data: n as unknown as Record<string, unknown>,
      selected: n.id === selectedNodeId,
      draggable: false,
    }))
  }, [graph, layout, selectedNodeId])

  const rfEdges = useMemo<Edge[]>(() => {
    if (!graph) return []
    const derives: Edge[] = graph.derivesEdges.map((e) => ({
      id: `d:${e.source}>${e.target}`,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      style: { stroke: 'var(--c-primary)', strokeWidth: 1.6 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#1d4ed8' },
    }))
    const shared: Edge[] = graph.sharedEdges.map((e) => ({
      id: `s:${pairKey(e.source, e.target)}`,
      source: e.source,
      target: e.target,
      type: 'shared',
      data: { count: e.count, files: graph.sharedFiles.get(pairKey(e.source, e.target)) ?? [] },
    }))
    return [...derives, ...shared]
  }, [graph])

  // 画布拖线改来源（US3 / FR-016）：客户端防环预检 + 后端权威校验
  const onConnect = useCallback(
    (c: Connection) => {
      if (!current) return
      const r = resolveConnection(current.nodes, c)
      if (!r.ok) {
        if (r.reason === 'cycle') setToast({ kind: 'err', text: STR.cycleError })
        return
      }
      api
        .setNodeParent(r.nodeId, r.parentId)
        .then(refreshCurrent)
        .catch((e: Error) => setToast({ kind: 'err', text: e.message }))
    },
    [current, refreshCurrent, setToast],
  )

  if (!current) return null

  // 空状态（FR-009）：不挂载画布
  if (current.nodes.length === 0) {
    return (
      <div className="graph-panel" data-testid="flow-graph">
        <div className="graph-panel-title">{STR.flowGraphTitle}</div>
        <EmptyState
          icon={<LayersIcon size={36} />}
          text={STR.graphEmpty}
          hint={STR.graphEmptyHint}
          action={
            <Btn variant="soft" onClick={() => startCreate()}>
              {STR.newNode}
            </Btn>
          }
        />
      </div>
    )
  }

  return (
    <div className="graph-panel" data-testid="flow-graph">
      <div className="graph-panel-title">{STR.flowGraphTitle}</div>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={(_, node) => select(node.id)}
        onConnect={onConnect}
        nodesDraggable={false}
        edgesFocusable={false}
        onNodesChange={() => {}}
        onEdgesChange={() => {}}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
        minZoom={0.15}
        maxZoom={2}
        deleteKeyCode={null}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="#c9d3e0" />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
    </div>
  )
}

export default FlowGraphInner
