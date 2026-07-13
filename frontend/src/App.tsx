import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type FacilitySnapshot = {
  facility: {
    name: string
    status: string
    hoursLabel: string
  }
  spaces: Space[]
  scheduleBlocks: ScheduleBlock[]
  spaceStatuses: SpaceStatus[]
  equipment: Equipment[]
  reports: Report[]
  comments: Comment[]
}

type Space = {
  id: string
  name: string
  kind: string
  location: string
}

type ScheduleBlock = {
  id: string
  spaceId: string
  activity: string
  startsAt: string
  endsAt: string
}

type SpaceStatus = {
  spaceId: string
  current: ScheduleBlock | null
  next: ScheduleBlock | null
}

type Equipment = {
  id: string
  name: string
  floor: number
  zone: string
  category: string
  status: string
  summary: string
}

type Report = {
  id: string
  targetType: 'equipment' | 'space'
  targetId: string
  issueType: string
  body: string
  createdAt: string
}

type Comment = {
  id: string
  reportId: string
  body: string
  createdAt: string
}

type Tab = 'all' | 'report' | 'activity'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5001'
const tabs: { id: Tab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'report', label: 'Report' },
  { id: 'activity', label: 'Activity' },
]

function App() {
  const [snapshot, setSnapshot] = useState<FacilitySnapshot | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('all')
  const [targetValue, setTargetValue] = useState('')
  const [issueType, setIssueType] = useState('broken')
  const [reportBody, setReportBody] = useState('')
  const [commentBodies, setCommentBodies] = useState<Record<string, string>>({})
  const [formMessage, setFormMessage] = useState('')

  async function loadFacility() {
    try {
      setIsLoading(true)
      setError('')
      const response = await fetch(`${API_BASE_URL}/api/facility`)

      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`)
      }

      const data = (await response.json()) as FacilitySnapshot
      setSnapshot(data)
    } catch {
      setError('Could not load the facility API. Start the backend on port 5001.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let ignore = false

    async function load() {
      try {
        setIsLoading(true)
        setError('')
        const response = await fetch(`${API_BASE_URL}/api/facility`)

        if (!response.ok) {
          throw new Error(`Request failed with ${response.status}`)
        }

        const data = (await response.json()) as FacilitySnapshot

        if (!ignore) {
          setSnapshot(data)
        }
      } catch {
        if (!ignore) {
          setError('Could not load the facility API. Start the backend on port 5001.')
        }
      } finally {
        if (!ignore) {
          setIsLoading(false)
        }
      }
    }

    load()

    return () => {
      ignore = true
    }
  }, [])

  const targetNames = useMemo(() => {
    if (!snapshot) return new Map<string, string>()

    return new Map([
      ...snapshot.equipment.map((item) => [item.id, item.name] as const),
      ...snapshot.spaces.map((space) => [space.id, space.name] as const),
    ])
  }, [snapshot])

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const [targetType, targetId] = targetValue.split(':')

    try {
      setFormMessage('')
      const response = await fetch(`${API_BASE_URL}/api/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType,
          targetId,
          issueType,
          body: reportBody,
        }),
      })

      if (!response.ok) {
        throw new Error('Report failed')
      }

      setTargetValue('')
      setIssueType('broken')
      setReportBody('')
      setFormMessage('Report added.')
      await loadFacility()
    } catch {
      setFormMessage('Could not add report.')
    }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>, reportId: string) {
    event.preventDefault()
    const body = commentBodies[reportId] ?? ''

    try {
      const response = await fetch(`${API_BASE_URL}/api/reports/${reportId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })

      if (!response.ok) {
        throw new Error('Comment failed')
      }

      setCommentBodies((current) => ({ ...current, [reportId]: '' }))
      await loadFacility()
    } catch {
      setFormMessage('Could not add comment.')
    }
  }

  if (isLoading) {
    return <MessageCard title="Loading facility" body="Reading the backend snapshot..." />
  }

  if (error || !snapshot) {
    return <MessageCard title="API unavailable" body={error} />
  }

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Gym Facility Tracker</p>
          <h1>{snapshot.facility.name}</h1>
        </div>
        <div className="facility-state">
          <strong>{titleCase(snapshot.facility.status)}</strong>
          <span>{snapshot.facility.hoursLabel}</span>
        </div>
      </header>

      <nav className="tabs" aria-label="Main sections">
        {tabs.map((tab) => (
          <button
            className={activeTab === tab.id ? 'active' : ''}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'all' && (
        <>
          <section className="section">
            <div className="section-heading">
              <p className="eyebrow">Spaces change by time</p>
              <h2>Courts and spaces</h2>
            </div>
            <div className="grid">
              {snapshot.spaces.map((space) => {
                const status = snapshot.spaceStatuses.find(
                  (item) => item.spaceId === space.id,
                )

                return (
                  <article className="card" key={space.id}>
                    <p className="eyebrow">{humanize(space.kind)}</p>
                    <h3>{space.name}</h3>
                    <p>{space.location}</p>
                    <div className="schedule-list">
                      <div>
                        <span>Now</span>
                        <strong>
                          {status?.current?.activity ?? 'No active booking'}
                        </strong>
                        {status?.current && (
                          <span>Until {formatTime(status.current.endsAt)}</span>
                        )}
                      </div>
                      <div>
                        <span>Next</span>
                        <strong>
                          {status?.next?.activity ?? 'No upcoming booking'}
                        </strong>
                        {status?.next && (
                          <span>
                            {formatTime(status.next.startsAt)} -{' '}
                            {formatTime(status.next.endsAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>

          <section className="section">
            <div className="section-heading">
              <p className="eyebrow">Equipment has status</p>
              <h2>Equipment</h2>
            </div>
            <div className="list">
              {snapshot.equipment.map((item) => (
                <article className="row" key={item.id}>
                  <div>
                    <h3>{item.name}</h3>
                    <p>
                      Level {item.floor} - {item.zone}
                    </p>
                  </div>
                  <span className={`status ${item.status}`}>
                    {titleCase(item.status)}
                  </span>
                  <p>{item.summary}</p>
                </article>
              ))}
            </div>
          </section>
        </>
      )}

      {activeTab === 'report' && (
        <section className="section">
          <div className="section-heading">
            <p className="eyebrow">Create a report</p>
            <h2>Report an issue</h2>
            <p className="section-note">
              Reports are temporary while this app is still using in-memory data.
            </p>
          </div>
          <form className="form-card" onSubmit={submitReport}>
            <label>
              Target
              <select
                onChange={(event) => setTargetValue(event.target.value)}
                required
                value={targetValue}
              >
                <option value="">Select equipment or space</option>
                <optgroup label="Equipment">
                  {snapshot.equipment.map((item) => (
                    <option key={item.id} value={`equipment:${item.id}`}>
                      {item.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Spaces">
                  {snapshot.spaces.map((space) => (
                    <option key={space.id} value={`space:${space.id}`}>
                      {space.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            <label>
              Issue
              <select
                onChange={(event) => setIssueType(event.target.value)}
                value={issueType}
              >
                <option value="broken">Broken</option>
                <option value="cleanliness">Cleanliness</option>
                <option value="missing_parts">Missing parts</option>
                <option value="schedule_mismatch">Schedule mismatch</option>
              </select>
            </label>
            <label className="wide-field">
              Details
              <textarea
                onChange={(event) => setReportBody(event.target.value)}
                placeholder="What should other students know?"
                required
                rows={3}
                value={reportBody}
              />
            </label>
            <button type="submit">Add report</button>
            {formMessage && <p className="form-message">{formMessage}</p>}
          </form>
        </section>
      )}

      {activeTab === 'activity' && (
        <section className="section">
          <div className="section-heading">
            <p className="eyebrow">Reports need discussion</p>
            <h2>Reports and comments</h2>
          </div>
          <div className="grid">
            {snapshot.reports.map((report) => {
              const comments = snapshot.comments.filter(
                (comment) => comment.reportId === report.id,
              )

              return (
                <article className="card" key={report.id}>
                  <p className="eyebrow">{humanize(report.issueType)}</p>
                  <h3>{targetNames.get(report.targetId) ?? report.targetId}</h3>
                  <p>{report.body}</p>
                  <p className="report-meta">{formatDateTime(report.createdAt)}</p>
                  <div className="comments">
                    {comments.map((comment) => (
                      <p key={comment.id}>{comment.body}</p>
                    ))}
                  </div>
                  <form
                    className="comment-form"
                    onSubmit={(event) => submitComment(event, report.id)}
                  >
                    <input
                      aria-label={`Comment on ${targetNames.get(report.targetId) ?? report.targetId}`}
                      onChange={(event) =>
                        setCommentBodies((current) => ({
                          ...current,
                          [report.id]: event.target.value,
                        }))
                      }
                      placeholder="Add a comment"
                      required
                      value={commentBodies[report.id] ?? ''}
                    />
                    <button type="submit">Post</button>
                  </form>
                </article>
              )
            })}
          </div>
        </section>
      )}
    </main>
  )
}

function MessageCard({ title, body }: { title: string; body: string }) {
  return (
    <main className="page">
      <div className="message-card">
        <p className="eyebrow">Gym Facility Tracker</p>
        <h1>{title}</h1>
        <p>{body}</p>
      </div>
    </main>
  )
}

function humanize(value: string) {
  return value.replaceAll('_', ' ')
}

function titleCase(value: string) {
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

export default App
