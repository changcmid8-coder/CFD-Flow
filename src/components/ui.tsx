import { CloseIcon } from './icons'
import type { CSSProperties, ReactNode } from 'react'
import { useEffect } from 'react'

/* 基础组件库：全部消费 tokens.css 设计令牌，禁止私定颜色/圆角（章程：体验与视觉标准） */

export function Btn(props: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'danger' | 'soft'
  disabled?: boolean
  title?: string
  small?: boolean
}) {
  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    borderRadius: 'var(--radius-s)',
    border: '1px solid transparent',
    cursor: props.disabled ? 'default' : 'pointer',
    fontWeight: 500,
    transition: 'background var(--dur-1) var(--ease), border-color var(--dur-1) var(--ease)',
    padding: props.small ? '4px 10px' : '8px 16px',
    fontSize: props.small ? 'var(--fs-s)' : 'var(--fs-m)',
    whiteSpace: 'nowrap',
    opacity: props.disabled ? 0.5 : 1,
  }
  const variants: Record<string, CSSProperties> = {
    primary: { background: 'var(--c-primary)', color: '#fff' },
    ghost: { background: 'transparent', color: 'var(--c-text-2)', borderColor: 'var(--c-border)' },
    soft: { background: 'var(--c-primary-soft)', color: 'var(--c-primary)' },
    danger: { background: 'var(--c-danger)', color: '#fff' },
  }
  return (
    <button
      type="button"
      title={props.title}
      disabled={props.disabled}
      style={{ ...base, ...variants[props.variant ?? 'ghost'] }}
      onMouseEnter={(e) => {
        if (props.disabled) return
        if ((props.variant ?? 'ghost') === 'primary') e.currentTarget.style.background = 'var(--c-primary-hover)'
      }}
      onMouseLeave={(e) => {
        if ((props.variant ?? 'ghost') === 'primary') e.currentTarget.style.background = 'var(--c-primary)'
      }}
      onClick={() => !props.disabled && props.onClick?.()}
    >
      {props.children}
    </button>
  )
}

export function Dialog(props: { title: string; onClose?: () => void; children: ReactNode; width?: number }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props.onClose])
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,.44)', zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) props.onClose?.() }}
    >
      <div
        style={{
          background: 'var(--c-surface)', borderRadius: 'var(--radius-l)', boxShadow: 'var(--shadow-2)',
          width: props.width ?? 560, maxHeight: '86vh', display: 'flex', flexDirection: 'column',
          animation: 'dlgIn var(--dur-2) var(--ease)',
        }}
      >
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: 'var(--sp-4) var(--sp-5)', borderBottom: '1px solid var(--c-border)',
          }}
        >
          <div style={{ fontSize: 'var(--fs-l)', fontWeight: 600 }}>{props.title}</div>
          {props.onClose && (
            <button
              type="button" aria-label="关闭" onClick={props.onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-3)', display: 'flex', padding: 4 }}
            >
              <CloseIcon />
            </button>
          )}
        </div>
        <div style={{ padding: 'var(--sp-5)', overflowY: 'auto' }}>{props.children}</div>
      </div>
    </div>
  )
}

export function ConfirmDialog(props: {
  title: string
  body: ReactNode
  danger?: boolean
  onOk: () => void
  onCancel: () => void
  okText?: string
}) {
  return (
    <Dialog title={props.title} onClose={props.onCancel} width={460}>
      <div style={{ color: 'var(--c-text-2)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{props.body}</div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)', marginTop: 'var(--sp-5)' }}>
        <Btn onClick={props.onCancel}>{'取消'}</Btn>
        <Btn variant={props.danger ? 'danger' : 'primary'} onClick={props.onOk}>
          {props.okText ?? '确定'}
        </Btn>
      </div>
    </Dialog>
  )
}

export function EmptyState(props: { icon?: ReactNode; text: string; hint?: string; action?: ReactNode }) {
  return (
    <div
      data-testid="empty-state"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 'var(--sp-2)', padding: 'var(--sp-6)', color: 'var(--c-text-3)', textAlign: 'center', height: '100%',
      }}
    >
      {props.icon}
      <div style={{ fontSize: 'var(--fs-l)', color: 'var(--c-text-2)' }}>{props.text}</div>
      {props.hint && <div style={{ fontSize: 'var(--fs-m)' }}>{props.hint}</div>}
      {props.action}
    </div>
  )
}

export function Spinner(props: { size?: number }) {
  const s = props.size ?? 18
  return (
    <span
      aria-label="加载中"
      style={{
        width: s, height: s, display: 'inline-block',
        border: '2px solid var(--c-border)', borderTopColor: 'var(--c-primary)',
        borderRadius: '50%', animation: 'spin 0.8s linear infinite',
      }}
    />
  )
}

export function ErrorBanner(props: { text: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      style={{
        background: 'var(--c-danger-soft)', color: 'var(--c-danger)', borderRadius: 'var(--radius-m)',
        padding: 'var(--sp-3) var(--sp-4)', display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
        margin: 'var(--sp-3) 0', fontSize: 'var(--fs-m)',
      }}
    >
      <span style={{ flex: 1 }}>{props.text}</span>
      {props.onRetry && (
        <Btn small onClick={props.onRetry}>
          重试
        </Btn>
      )}
    </div>
  )
}

export function ProgressBar(props: { value: number }) {
  const pct = Math.max(0, Math.min(1, props.value)) * 100
  return (
    <div style={{ background: 'var(--c-surface-2)', borderRadius: 999, height: 8, overflow: 'hidden' }}>
      <div
        style={{
          width: `${pct}%`, height: '100%', background: 'var(--c-primary)',
          borderRadius: 999, transition: 'width var(--dur-2) var(--ease)',
        }}
      />
    </div>
  )
}

export function Badge(props: { text: string; tone?: 'ok' | 'warn' | 'err' | 'info' }) {
  const tones: Record<string, CSSProperties> = {
    ok: { background: 'var(--c-success-soft)', color: 'var(--c-success)' },
    warn: { background: 'var(--c-warn-soft)', color: 'var(--c-warn)' },
    err: { background: 'var(--c-danger-soft)', color: 'var(--c-danger)' },
    info: { background: 'var(--c-primary-soft)', color: 'var(--c-primary)' },
  }
  return (
    <span
      style={{
        ...tones[props.tone ?? 'info'], borderRadius: 999, padding: '1px 8px',
        fontSize: 'var(--fs-s)', fontWeight: 500, whiteSpace: 'nowrap',
      }}
    >
      {props.text}
    </span>
  )
}

export function Field(props: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label style={{ display: 'block', marginBottom: 'var(--sp-4)' }}>
      <div style={{ fontSize: 'var(--fs-m)', color: 'var(--c-text-2)', marginBottom: 'var(--sp-1)' }}>{props.label}</div>
      {props.children}
      {props.hint && <div style={{ fontSize: 'var(--fs-s)', color: 'var(--c-text-3)', marginTop: 4 }}>{props.hint}</div>}
    </label>
  )
}

export const inputStyle: CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-s)',
  border: '1px solid var(--c-border)', fontSize: 'var(--fs-m)',
  outline: 'none', background: 'var(--c-surface)', color: 'var(--c-text)',
  userSelect: 'text',
}

export function Toast(props: { kind: 'ok' | 'warn' | 'err'; text: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(props.onClose, 4200)
    return () => clearTimeout(t)
  }, [props.text, props.onClose])
  const bg = props.kind === 'ok' ? 'var(--c-success)' : props.kind === 'warn' ? 'var(--c-warn)' : 'var(--c-danger)'
  return (
    <div
      role="status"
      style={{
        position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
        background: bg, color: '#fff', borderRadius: 'var(--radius-m)', padding: '10px 18px',
        boxShadow: 'var(--shadow-2)', zIndex: 300, fontSize: 'var(--fs-m)', maxWidth: '70vw',
      }}
    >
      {props.text}
    </div>
  )
}
