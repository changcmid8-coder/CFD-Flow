import { useState } from 'react'
import { useProjects } from '../stores/projects'
import { STR } from '../lib/strings'
import { Badge, Btn, ConfirmDialog, Dialog, EmptyState, ErrorBanner, Field, inputStyle, Spinner } from '../components/ui'
import { FolderIcon } from '../components/icons'
import { formatBytes, formatTime, fill } from '../lib/format'

export default function ProjectsView() {
  const { projects, loading, error, open, create, remove, load } = useProjects()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  const doCreate = async () => {
    try {
      await create(name, note || null)
      setCreating(false)
      setName('')
      setNote('')
    } catch (e) {
      // 创建失败在对话框内提示
      alert((e as Error).message)
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
          padding: 'var(--sp-4) var(--sp-5)', borderBottom: '1px solid var(--c-border)',
          background: 'var(--c-surface)',
        }}
      >
        <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 600, flex: 1 }}>{STR.appName}</div>
        <Btn variant="primary" onClick={() => setCreating(true)}>{STR.newProject}</Btn>
      </header>

      <main style={{ flex: 1, overflowY: 'auto', padding: 'var(--sp-5)' }}>
        {error && <ErrorBanner text={error} onRetry={load} />}
        {loading && projects.length === 0 ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--sp-6)' }}><Spinner /></div>
        ) : projects.length === 0 ? (
          <EmptyState
            icon={<FolderIcon />}
            text={STR.emptyProjects}
            hint={STR.emptyProjectsHint}
            action={<Btn variant="soft" onClick={() => setCreating(true)}>{STR.newProject}</Btn>}
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--sp-4)', maxWidth: 1100, margin: '0 auto' }}>
            {projects.map((p) => (
              <div
                key={p.id}
                data-testid="project-card"
                role="button"
                tabIndex={0}
                aria-label={`打开工程 ${p.name}`}
                onClick={() => open(p.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') open(p.id)
                }}
                style={{
                  background: 'var(--c-surface)', borderRadius: 'var(--radius-l)', padding: 'var(--sp-5)',
                  border: '1px solid var(--c-border)', cursor: 'pointer', boxShadow: 'var(--shadow-1)',
                  transition: 'box-shadow var(--dur-2) var(--ease), transform var(--dur-2) var(--ease)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-2)' }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-1)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                  <div style={{ fontSize: 'var(--fs-l)', fontWeight: 600, flex: 1 }}>{p.name}</div>
                  {p.pending_count > 0 && <Badge tone="info" text={fill(STR.pendingCount, { n: p.pending_count })} />}
                </div>
                {p.note && <div style={{ color: 'var(--c-text-2)', marginTop: 'var(--sp-2)' }}>{p.note}</div>}
                <div style={{ color: 'var(--c-text-3)', fontSize: 'var(--fs-s)', marginTop: 'var(--sp-3)', display: 'flex', alignItems: 'center' }}>
                  <span style={{ flex: 1 }}>更新于 {formatTime(p.updated_at)}</span>
                  <button
                    type="button"
                    aria-label={STR.deleteProject}
                    onClick={(e) => { e.stopPropagation(); setDeleting(p.id) }}
                    style={{ background: 'none', border: 'none', color: 'var(--c-text-3)', cursor: 'pointer', fontSize: 'var(--fs-s)' }}
                  >
                    {STR.deleteProject}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {creating && (
        <Dialog title={STR.newProject} onClose={() => setCreating(false)} width={460}>
          <Field label={STR.projectName}>
            <input style={inputStyle} value={name} autoFocus onChange={(e) => setName(e.target.value)} maxLength={100} />
          </Field>
          <Field label={STR.projectNote}>
            <textarea style={{ ...inputStyle, height: 80 }} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
          </Field>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-2)' }}>
            <Btn onClick={() => setCreating(false)}>{STR.cancel}</Btn>
            <Btn variant="primary" disabled={!name.trim()} onClick={doCreate}>{STR.save}</Btn>
          </div>
        </Dialog>
      )}

      {deleting && (
        <ConfirmDialog
          title={STR.deleteProject}
          body={STR.deleteProjectConfirm}
          danger
          onCancel={() => setDeleting(null)}
          onOk={async () => {
            await remove(deleting)
            setDeleting(null)
          }}
        />
      )}
    </div>
  )
}
