// 归档流程图：绘制指令纯函数 + Canvas 执行器 + 保存编排
// 契约见 specs/003-archive-diagram-presets/contracts/diagram-and-presets.md
import { buildGraphData, computeLayout, NODE_W, NODE_H, type GraphData } from './graph'
import { formatBytes, fill } from './format'
import { STR } from './strings'
import { useProjects } from '../stores/projects'
import { useArchive } from '../stores/archive'
import { saveArchiveDiagram, type BatchFinal } from './api'

export const DIAGRAM_MARGIN = 40
export const DIAGRAM_TITLE_H = 76
const DIAGRAM_FILE = '流程图.png'

export interface DiagramBox {
  id: string
  x: number
  y: number
  w: number
  h: number
  name: string
  total: number
  pending: number
  archived: number
  missing: number
  sizeText: string
}

export interface DiagramArrow {
  fromId: string
  toId: string
  points: Array<{ x: number; y: number }>
}

export interface DiagramShared {
  aId: string
  bId: string
  count: number
  points: Array<{ x: number; y: number }>
}

export interface DiagramPlan {
  title: string
  generatedAt: string
  boxes: DiagramBox[]
  arrows: DiagramArrow[]
  sharedLinks: DiagramShared[]
  canvas: { width: number; height: number }
}

/**
 * 绘制指令纯函数：图数据 + 布局 → DiagramPlan（jsdom 可单测）。
 * 口径与框图完全同源（FR-003）：box 摘要来自 GraphNodeSummary，箭头自上而下。
 */
export function buildDiagramPlan(
  graph: GraphData,
  layout: { positions: Map<string, { x: number; y: number }>; width: number; height: number },
  opts: { projectName: string; generatedAt: string },
): DiagramPlan {
  const boxes: DiagramBox[] = graph.nodes.map((n) => {
    const p = layout.positions.get(n.id) ?? { x: 0, y: 0 }
    return {
      id: n.id,
      x: p.x + DIAGRAM_MARGIN,
      y: p.y + DIAGRAM_TITLE_H,
      w: NODE_W,
      h: NODE_H,
      name: n.name,
      total: n.total,
      pending: n.pending,
      archived: n.archived,
      missing: n.missing,
      sizeText: formatBytes(n.sizeBytes),
    }
  })
  const byId = new Map(boxes.map((b) => [b.id, b]))

  const arrows: DiagramArrow[] = graph.derivesEdges.map((e) => {
    const a = byId.get(e.source)!
    const b = byId.get(e.target)!
    const midY = (a.y + a.h + b.y) / 2
    return {
      fromId: e.source,
      toId: e.target,
      points: [
        { x: a.x + a.w / 2, y: a.y + a.h },
        { x: a.x + a.w / 2, y: midY },
        { x: b.x + b.w / 2, y: midY },
        { x: b.x + b.w / 2, y: b.y },
      ],
    }
  })

  const sharedLinks: DiagramShared[] = graph.sharedEdges.map((e) => {
    const a = byId.get(e.source)!
    const b = byId.get(e.target)!
    const [l, r] = a.x <= b.x ? [a, b] : [b, a]
    return {
      aId: e.source,
      bId: e.target,
      count: e.count ?? 0,
      points: [
        { x: l.x + l.w, y: l.y + l.h / 2 },
        { x: r.x, y: r.y + r.h / 2 },
      ],
    }
  })

  const canvas = {
    width: layout.width + DIAGRAM_MARGIN * 2,
    height: layout.height + DIAGRAM_TITLE_H + DIAGRAM_MARGIN,
  }
  return {
    title: `${opts.projectName} · 流程图`,
    generatedAt: opts.generatedAt,
    boxes,
    arrows,
    sharedLinks,
    canvas,
  }
}

// ---------- Canvas 执行器（真机路径，jsdom 不测） ----------

type Ctx = CanvasRenderingContext2D

function cssColor(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function pill(ctx: Ctx, x: number, y: number, text: string, bg: string, fg: string) {
  ctx.font = '12px "Segoe UI", "Microsoft YaHei", sans-serif'
  const w = ctx.measureText(text).width + 14
  ctx.fillStyle = bg
  roundRect(ctx, x, y, w, 18, 9)
  ctx.fill()
  ctx.fillStyle = fg
  ctx.fillText(text, x + 7, y + 13)
  return w
}

function truncate(ctx: Ctx, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1)
  return `${t}…`
}

function drawArrowhead(ctx: Ctx, points: Array<{ x: number; y: number }>, color: string) {
  const p1 = points[points.length - 2]
  const p2 = points[points.length - 1]
  const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x)
  const size = 9
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(p2.x, p2.y)
  ctx.lineTo(p2.x - size * Math.cos(ang - Math.PI / 6), p2.y - size * Math.sin(ang - Math.PI / 6))
  ctx.lineTo(p2.x - size * Math.cos(ang + Math.PI / 6), p2.y - size * Math.sin(ang + Math.PI / 6))
  ctx.closePath()
  ctx.fill()
}

function strokePolyline(ctx: Ctx, points: Array<{ x: number; y: number }>, color: string, width: number, dash?: number[]) {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.setLineDash(dash ?? [])
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y)
  ctx.stroke()
  ctx.setLineDash([])
}

function drawPlan(ctx: Ctx, plan: DiagramPlan) {
  const primary = cssColor('--c-primary', '#1d4ed8')
  const warn = cssColor('--c-warn', '#b7791f')
  const warnSoft = cssColor('--c-warn-soft', '#fbf1df')
  const border = cssColor('--c-border', '#e2e7f0')
  const surface = cssColor('--c-surface', '#ffffff')
  const text = cssColor('--c-text', '#1b2430')
  const text2 = cssColor('--c-text-2', '#5b6b7f')
  const text3 = cssColor('--c-text-3', '#8a97a8')
  const primarySoft = cssColor('--c-primary-soft', '#e8eefc')
  const success = cssColor('--c-success', '#178a50')
  const successSoft = cssColor('--c-success-soft', '#e6f5ec')
  const danger = cssColor('--c-danger', '#d93a3a')
  const dangerSoft = cssColor('--c-danger-soft', '#fdeaea')
  const font = '"Segoe UI", "Microsoft YaHei", sans-serif'

  ctx.fillStyle = cssColor('--c-bg', '#f4f6fa')
  ctx.fillRect(0, 0, plan.canvas.width, plan.canvas.height)

  // 标题与生成时间注记
  ctx.fillStyle = text
  ctx.font = `600 20px ${font}`
  ctx.fillText(plan.title, DIAGRAM_MARGIN, 36)
  ctx.fillStyle = text3
  ctx.font = `12px ${font}`
  ctx.fillText(`生成时间 ${plan.generatedAt} · 由 CFD-Flow 导出`, DIAGRAM_MARGIN, 58)

  // 共享连线（置于框下层）：虚线 + 计数标签
  for (const s of plan.sharedLinks) {
    strokePolyline(ctx, s.points, warn, 1.6, [6, 4])
    const mid = s.points[0]
    pill(ctx, mid.x + 8, mid.y - 22, fill(STR.sharedCount, { n: s.count }), warnSoft, warn)
  }

  // 来源箭头（自上而下）
  for (const a of plan.arrows) {
    strokePolyline(ctx, a.points, primary, 1.8)
    drawArrowhead(ctx, a.points, primary)
  }

  // 节点框
  for (const b of plan.boxes) {
    ctx.fillStyle = surface
    ctx.strokeStyle = border
    ctx.lineWidth = 1
    roundRect(ctx, b.x, b.y, b.w, b.h, 10)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = text
    ctx.font = `600 13px ${font}`
    ctx.fillText(truncate(ctx, b.name, b.w - 24), b.x + 12, b.y + 22)

    let bx = b.x + 12
    if (b.pending > 0) bx += pill(ctx, bx, b.y + 32, `待归档 ${b.pending}`, primarySoft, primary) + 6
    if (b.archived > 0) bx += pill(ctx, bx, b.y + 32, `已归档 ${b.archived}`, successSoft, success) + 6
    if (b.missing > 0) pill(ctx, bx, b.y + 32, `源失效 ${b.missing}`, dangerSoft, danger)

    ctx.fillStyle = text3
    ctx.font = `12px ${font}`
    ctx.fillText(`${b.total} 项 · ${b.sizeText}`, b.x + 12, b.y + b.h - 12)
  }
  void text2
}

/** Canvas 执行：指令 → PNG Blob（2× 分辨率抗锯齿）。 */
export async function renderToBlob(plan: DiagramPlan, scale = 2): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(plan.canvas.width * scale)
  canvas.height = Math.ceil(plan.canvas.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建画布上下文')
  ctx.scale(scale, scale)
  drawPlan(ctx, plan)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('PNG 导出失败'))),
      'image/png',
    )
  })
}

/**
 * 保存编排（US1 / FR-001/FR-005）：copied>0 → refresh → 同源图数据 → 指令 → PNG → 写盘。
 * 任一步失败经归档 notice 可见警告（warn），不抛出、不影响归档结果判定。
 */
export async function exportArchiveDiagram(final: BatchFinal): Promise<void> {
  const archive = useArchive.getState()
  try {
    if (final.copied <= 0 || !final.target_root) return
    const projects = useProjects.getState()
    await projects.refreshCurrent()
    const cur = useProjects.getState().current
    if (!cur || cur.nodes.length === 0) return
    const graph = buildGraphData(cur)
    const layout = computeLayout(graph.nodes, graph.derivesEdges)
    const plan = buildDiagramPlan(graph, layout, {
      projectName: cur.project.name,
      generatedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
    })
    const blob = await renderToBlob(plan)
    const buf = new Uint8Array(await blob.arrayBuffer())
    await saveArchiveDiagram(final.target_root, cur.project.name, buf)
    archive.setNotice({ kind: 'ok', text: STR.diagramSaved })
  } catch (e) {
    archive.setNotice({
      kind: 'warn',
      text: fill(STR.diagramFailed, { reason: (e as Error).message }),
    })
  }
}
