import { describe, expect, it } from 'vitest'
import { NODE_PRESETS } from './presets'

describe('NODE_PRESETS（US2 内置预设清单 / FR-006）', () => {
  it('contains at least the five typical CFD workflow presets', () => {
    expect(NODE_PRESETS.length).toBeGreaterThanOrEqual(5)
    for (const p of ['参考文献', '原始几何', '网格划分', '计算求解', '后处理']) {
      expect(NODE_PRESETS).toContain(p)
    }
  })

  it('is a readonly constant array of non-empty strings', () => {
    for (const p of NODE_PRESETS) {
      expect(typeof p).toBe('string')
      expect(p.trim().length).toBeGreaterThan(0)
    }
  })
})
