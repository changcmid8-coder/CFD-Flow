import '@testing-library/jest-dom/vitest'

// React Flow 依赖 ResizeObserver / DOMMatrixReadOnly，jsdom 未内置。
// RO 在 observe 时同步回调一次尺寸，让 RF 完成节点测量（否则边不渲染）。
class ResizeObserverMock {
  cb: ResizeObserverCallback
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb
  }
  observe(target: Element) {
    const entry = {
      target,
      contentRect: { width: 640, height: 480, x: 0, y: 0, top: 0, left: 0, bottom: 480, right: 640 },
    } as unknown as ResizeObserverEntry
    this.cb([entry] as unknown as ResizeObserverEntry[], this as unknown as ResizeObserver)
  }
  unobserve() {}
  disconnect() {}
}
const g = globalThis as unknown as Record<string, unknown>
g.ResizeObserver = g.ResizeObserver ?? ResizeObserverMock
class DOMMatrixReadOnlyMock {
  m22 = 1
  constructor(params: Record<string, number> = {}) {
    Object.assign(this, params)
  }
}
g.DOMMatrixReadOnly = g.DOMMatrixReadOnly ?? DOMMatrixReadOnlyMock

