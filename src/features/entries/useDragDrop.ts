import { useEffect, useRef } from 'react'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { useNodes } from '../../stores/nodes'

/**
 * 全局拖拽接入：Tauri 原生窗口拖放事件给出真实源路径（Web 层拿不到）。
 * 悬停高亮命中的节点行（data-node-id），放下时把路径交给该节点登记。
 */
export function useDragDrop(onFiles: (paths: string[], nodeId: string) => void) {
  const onFilesRef = useRef(onFiles)
  onFilesRef.current = onFiles

  useEffect(() => {
    let hovered: string | null = null
    let unlisten: (() => void) | undefined
    let disposed = false

    const hitNode = (x: number, y: number): string | null => {
      const dpr = window.devicePixelRatio || 1
      const el = document.elementFromPoint(x / dpr, y / dpr)
      const row = el?.closest('[data-node-id]') as HTMLElement | null
      return row?.dataset.nodeId ?? null
    }

    const setHover = (id: string | null) => {
      if (hovered !== id) {
        hovered = id
        useNodes.getState().setHovered(id)
      }
    }

    getCurrentWebview()
      .onDragDropEvent((ev) => {
        const t = ev.payload.type
        if (t === 'enter' || t === 'over') {
          const pos = ev.payload.position
          setHover(hitNode(pos.x, pos.y))
        } else if (t === 'drop') {
          const pos = ev.payload.position
          const nodeId = hitNode(pos.x, pos.y) ?? hovered
          const paths = ev.payload.paths ?? []
          setHover(null)
          if (nodeId && paths.length) onFilesRef.current(paths, nodeId)
        } else {
          setHover(null)
        }
      })
      .then((f) => {
        if (disposed) f()
        else unlisten = f
      })

    return () => {
      disposed = true
      unlisten?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
