import { useEffect, useMemo, useState } from 'react'
import './App.css'

type FacilitySnapshot = {
  facility: {
    name: string
    status: string
    hoursLabel: string
  }
  spaces: Space[]
  scheduleBlocks: ScheduleBlock[]
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

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5001'

function App() {
  const [snapshot, setSnapshot] = useState<FacilitySnapshot | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let ignore = false

    async function loadFacility() {
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
          setError('Could not load the facility API. Start the backend on port 5000.')
        }
      } finally {
        if (!ignore) {
          setIsLoading(false)
        }
      }
    }

    loadFacility()

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

      <section className="section">
        <div className="section-heading">
          <p className="eyebrow">Spaces change by time</p>
          <h2>Courts and spaces</h2>
        </div>
        <div className="grid">
          {snapshot.spaces.map((space) => {
            const blocks = snapshot.scheduleBlocks.filter(
              (block) => block.spaceId === space.id,
            )

            return (
              <article className="card" key={space.id}>
                <p className="eyebrow">{humanize(space.kind)}</p>
                <h3>{space.name}</h3>
                <p>{space.location}</p>
                <div className="schedule-list">
                  {blocks.length === 0 && <p>No schedule blocks yet.</p>}
                  {blocks.map((block) => (
                    <div key={block.id}>
                      <strong>{block.activity}</strong>
                      <span>
                        {formatTime(block.startsAt)} - {formatTime(block.endsAt)}
                      </span>
                    </div>
                  ))}
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
              </article>
            )
          })}
        </div>
      </section>
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
