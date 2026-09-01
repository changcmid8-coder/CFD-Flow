import { useEffect, useState } from 'react'
import { useProjects } from '../stores/projects'
import { useArchive } from '../stores/archive'
import { onArchiveFinished, onArchiveProgress } from '../lib/api'
import ProjectsView from './ProjectsView'
import WorkspaceView from './WorkspaceView'
import { Spinner } from '../components/ui'
import { STR } from '../lib/strings'

export default function App() {
  const { load, loading, current, error } = useProjects()
  const setProgress = useArchive((s) => s.setProgress)
  const setFinal = useArchive((s) => s.setFinal)
  const [booted, setBooted] = useState(false)

  useEffect(() => {
    load().finally(() => setBooted(true))
    // 归档事件订阅挂在应用层：进度与结束事件驱动归档流程状态机
    const un1 = onArchiveProgress(setProgress)
    const un2 = onArchiveFinished(setFinal)
    return () => {
      un1.then((f) => f())
      un2.then((f) => f())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!booted && loading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-text-3)' }}>
        <Spinner /> <span style={{ marginLeft: 10 }}>{STR.loading}</span>
      </div>
    )
  }

  return error ? (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
      <div style={{ color: 'var(--c-danger)' }}>{error}</div>
      <button onClick={() => load()} style={{ cursor: 'pointer' }}>重试</button>
    </div>
  ) : current ? (
    <WorkspaceView />
  ) : (
    <ProjectsView />
  )
}
