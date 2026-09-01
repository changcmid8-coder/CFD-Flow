import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
  info: string | null
}

/**
 * 全局错误边界：任何未捕获的渲染异常都以可见信息呈现（章程原则 IV——禁止静默失败，
 * 白屏是最大的静默失败），并保留"重新加载"出口。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Unhandled render error:', error, info.componentStack)
    this.setState({ info: info.componentStack ?? null })
  }

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          style={{
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: 32,
            background: 'var(--c-bg)',
            color: 'var(--c-text)',
            userSelect: 'text',
          }}
        >
          <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 600, color: 'var(--c-danger)' }}>
            界面出现异常，已停止渲染以保护数据
          </div>
          <div style={{ color: 'var(--c-text-2)', textAlign: 'center', maxWidth: 720 }}>
            {this.state.error.message}
          </div>
          <pre
            style={{
              maxWidth: 860,
              maxHeight: '45vh',
              overflow: 'auto',
              background: 'var(--c-surface)',
              border: '1px solid var(--c-border)',
              borderRadius: 'var(--radius-m)',
              padding: 12,
              fontSize: 12,
              whiteSpace: 'pre-wrap',
              color: 'var(--c-text-2)',
            }}
          >
            {this.state.error.stack ?? ''}
            {'\n'}
            {this.state.info ?? ''}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              cursor: 'pointer',
              padding: '8px 20px',
              borderRadius: 'var(--radius-s)',
              border: '1px solid var(--c-border)',
              background: 'var(--c-surface)',
              color: 'var(--c-text)',
            }}
          >
            重新加载
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary
