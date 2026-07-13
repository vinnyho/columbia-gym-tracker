import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { createClient } from '@supabase/supabase-js'
import type { Session } from '@supabase/supabase-js'
import { io } from 'socket.io-client'
import './App.css'

type FacilitySnapshot = {
  facility: {
    name: string
    status: string
    hoursLabel: string
    sourceUrl: string
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
  status: string
  note: string
  calendarUrl?: string
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
  lastReportAt?: string
  lastReportAuthor?: string
  lastReportIssueType?: string
  statusScore?: number
}

type Report = {
  id: string
  targetType: 'equipment' | 'space'
  targetId: string
  issueType: string
  authorName: string
  body: string
  photoKey?: string
  photoUrl?: string
  createdAt: string
  confirmCount?: number
  disputeCount?: number
  weightedScore?: number
  viewerVote?: 'confirm' | 'dispute'
}

type Comment = {
  id: string
  reportId: string
  authorName: string
  body: string
  createdAt: string
}

type Tab = 'all' | 'schedule' | 'report' | 'activity' | 'profile'
type ActivityWindow = '24' | '48' | 'all'
type RealtimeStatus = 'connecting' | 'live' | 'offline'
type IssueOption = {
  label: string
  value: string
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:5001')
const REALTIME_URL =
  import.meta.env.VITE_REALTIME_URL ?? (import.meta.env.PROD ? '' : API_BASE_URL)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const DISPLAY_TIME_ZONE = 'America/New_York'
const supabase =
  SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
    : null
const tabs: { id: Tab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'report', label: 'Report' },
  { id: 'activity', label: 'Activity' },
  { id: 'profile', label: 'Profile' },
]
const equipmentIssueOptions: IssueOption[] = [
  { value: 'broken', label: 'Broken' },
  { value: 'fixed', label: 'Fixed / working again' },
  { value: 'cleanliness', label: 'Cleanliness' },
  { value: 'missing_parts', label: 'Missing parts' },
]
const spaceIssueOptions: IssueOption[] = [
  { value: 'schedule_mismatch', label: 'Schedule mismatch' },
  { value: 'cleanliness', label: 'Cleanliness' },
]

function App() {
  const hasLoadedFacility = useRef(false)
  const [snapshot, setSnapshot] = useState<FacilitySnapshot | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('connecting')
  const [activeTab, setActiveTab] = useState<Tab>('all')
  const [authEmail, setAuthEmail] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [isSendingAuthEmail, setIsSendingAuthEmail] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [floorFilter, setFloorFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [equipmentSearch, setEquipmentSearch] = useState('')
  const [activityWindow, setActivityWindow] = useState<ActivityWindow>('24')
  const [targetValue, setTargetValue] = useState('')
  const [issueType, setIssueType] = useState('broken')
  const [reportBody, setReportBody] = useState('')
  const [reportPhoto, setReportPhoto] = useState<File | null>(null)
  const [photoInputKey, setPhotoInputKey] = useState(0)
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const [commentBodies, setCommentBodies] = useState<Record<string, string>>({})
  const [formMessage, setFormMessage] = useState('')
  const authHeaders = useMemo(
    () =>
      session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined,
    [session?.access_token],
  )

  const loadFacility = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) {
        setIsLoading(true)
      } else {
        setIsRefreshing(true)
      }
      setError('')
      const response = await fetch(`${API_BASE_URL}/api/facility`, {
        headers: authHeaders,
      })

      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`)
      }

      const data = (await response.json()) as FacilitySnapshot
      setSnapshot(data)
    } catch {
      setError('Could not load the facility API. Start the backend on port 5001.')
    } finally {
      if (showLoading) {
        setIsLoading(false)
      } else {
        setIsRefreshing(false)
      }
    }
  }, [authHeaders])

  useEffect(() => {
    const showLoading = !hasLoadedFacility.current
    hasLoadedFacility.current = true
    void loadFacility(showLoading)
  }, [loadFacility])

  useEffect(() => {
    if (!supabase) return

    let ignore = false

    void supabase.auth.getSession().then(({ data }) => {
      if (!ignore) {
        setSession(data.session)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => {
      ignore = true
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!REALTIME_URL) {
      setRealtimeStatus('offline')
      return
    }

    const socket = io(REALTIME_URL, {
      transports: ['websocket'],
    })

    setRealtimeStatus('connecting')
    socket.on('connect', () => setRealtimeStatus('live'))
    socket.on('disconnect', () => setRealtimeStatus('offline'))
    socket.on('connect_error', () => setRealtimeStatus('offline'))
    socket.on('facility:update', () => {
      void loadFacility(false)
    })

    return () => {
      socket.close()
    }
  }, [loadFacility])

  const targetNames = useMemo(() => {
    if (!snapshot) return new Map<string, string>()

    return new Map([
      ...snapshot.equipment.map((item) => [item.id, item.name] as const),
      ...snapshot.spaces.map((space) => [space.id, space.name] as const),
    ])
  }, [snapshot])
  const signedInEmail = session?.user.email ?? ''
  const displayName = signedInEmail || 'Signed out'
  const ownReportCount = snapshot
    ? snapshot.reports.filter((report) => report.authorName === displayName).length
    : 0
  const ownCommentCount = snapshot
    ? snapshot.comments.filter((comment) => comment.authorName === displayName).length
    : 0
  const normalizedEquipmentSearch = equipmentSearch.trim().toLowerCase()
  const visibleEquipment = snapshot
    ? snapshot.equipment.filter(
        (item) => {
          const searchableText = [
            item.name,
            item.zone,
            item.category,
            item.summary,
            floorName(item.floor),
          ]
            .join(' ')
            .toLowerCase()

          return (
            (floorFilter === 'all' || String(item.floor) === floorFilter) &&
            (categoryFilter === 'all' || item.category === categoryFilter) &&
            (statusFilter === 'all' || item.status === statusFilter) &&
            (!normalizedEquipmentSearch ||
              searchableText.includes(normalizedEquipmentSearch))
          )
        },
      )
    : []
  const floors = snapshot
    ? Array.from(new Set(snapshot.equipment.map((item) => item.floor))).sort()
    : []
  const categories = snapshot
    ? Array.from(new Set(snapshot.equipment.map((item) => item.category))).sort()
    : []
  const visibleReports = snapshot
    ? snapshot.reports.filter((report) => {
        if (activityWindow === 'all') return true

        const hours = Number(activityWindow)
        const reportComments = snapshot.comments.filter(
          (comment) => comment.reportId === report.id,
        )

        return (
          isWithinHours(report.createdAt, hours) ||
          reportComments.some((comment) => isWithinHours(comment.createdAt, hours))
        )
      })
    : []
  const activityLabel =
    activityWindow === 'all' ? 'all time' : `last ${activityWindow} hours`
  const selectedTargetType = targetValue.split(':')[0]
  const reportIssueOptions =
    selectedTargetType === 'space' ? spaceIssueOptions : equipmentIssueOptions

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!session?.access_token) {
      setFormMessage('Sign in with your Columbia email before posting.')
      return
    }

    const [targetType, targetId] = targetValue.split(':')

    try {
      setFormMessage('')
      let photoKey = ''

      if (reportPhoto) {
        if (!reportPhoto.type.startsWith('image/')) {
          setFormMessage('Choose an image file for the photo.')
          return
        }

        if (reportPhoto.size > 5 * 1024 * 1024) {
          setFormMessage('Choose a photo under 5 MB.')
          return
        }

        setIsUploadingPhoto(true)
        const presignResponse = await fetch(`${API_BASE_URL}/api/report-photo-upload`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fileName: sanitizeFileName(reportPhoto.name),
            contentType: reportPhoto.type,
          }),
        })

        if (!presignResponse.ok) {
          throw new Error('Photo upload could not start')
        }

        const presign = (await presignResponse.json()) as {
          uploadUrl: string
          photoKey: string
        }
        const uploadResponse = await fetch(presign.uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': reportPhoto.type,
          },
          body: reportPhoto,
        })

        if (!uploadResponse.ok) {
          throw new Error('Photo upload failed')
        }

        photoKey = presign.photoKey
      }

      const response = await fetch(`${API_BASE_URL}/api/reports`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetType,
          targetId,
          issueType,
          body: reportBody,
          photoKey: photoKey || undefined,
        }),
      })

      if (!response.ok) {
        throw new Error('Report failed')
      }

      setTargetValue('')
      setIssueType('broken')
      setReportBody('')
      setReportPhoto(null)
      setPhotoInputKey((current) => current + 1)
      setFormMessage('Report added.')
      await loadFacility()
    } catch {
      setFormMessage('Could not add report.')
    } finally {
      setIsUploadingPhoto(false)
    }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>, reportId: string) {
    event.preventDefault()

    if (!session?.access_token) {
      setFormMessage('Sign in with your Columbia email before commenting.')
      return
    }

    const body = commentBodies[reportId] ?? ''

    try {
      const response = await fetch(`${API_BASE_URL}/api/reports/${reportId}/comments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
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

  async function submitVote(reportId: string, value: 'confirm' | 'dispute') {
    if (!session?.access_token) {
      setFormMessage('Sign in with your Columbia email before voting.')
      return
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/reports/${reportId}/votes`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value }),
      })

      if (!response.ok) {
        throw new Error('Vote failed')
      }

      await loadFacility(false)
    } catch {
      setFormMessage('Could not save vote.')
    }
  }

  async function submitAuthEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!supabase) {
      setAuthMessage('Supabase is not configured for this frontend.')
      return
    }

    const email = authEmail.trim().toLowerCase()

    if (!email.endsWith('@columbia.edu')) {
      setAuthMessage('Use your Columbia email address.')
      return
    }

    try {
      setIsSendingAuthEmail(true)
      setAuthMessage('')
      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin,
        },
      })

      if (authError) {
        throw authError
      }

      setAuthMessage('Check your Columbia email for the login link.')
    } catch {
      setAuthMessage('Could not send login email.')
    } finally {
      setIsSendingAuthEmail(false)
    }
  }

  async function signOut() {
    if (!supabase) return

    await supabase.auth.signOut()
    setAuthMessage('')
  }

  function startReport(
    targetType: 'equipment' | 'space',
    targetId: string,
    nextIssueType = 'broken',
    nextBody = '',
  ) {
    setTargetValue(`${targetType}:${targetId}`)
    setIssueType(nextIssueType)
    setReportBody(nextBody)
    setFormMessage('')
    setActiveTab('report')
  }

  function changeReportTarget(value: string) {
    const [nextTargetType] = value.split(':')
    const nextIssueOptions =
      nextTargetType === 'space' ? spaceIssueOptions : equipmentIssueOptions

    setTargetValue(value)

    if (!nextIssueOptions.some((option) => option.value === issueType)) {
      setIssueType(nextIssueOptions[0].value)
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
        <div className={`facility-state ${snapshot.facility.status}`}>
          <strong>{titleCase(snapshot.facility.status)}</strong>
          <span>{snapshot.facility.hoursLabel}</span>
          <a href={snapshot.facility.sourceUrl} rel="noreferrer" target="_blank">
            Columbia hours
          </a>
          <button
            className="refresh-button"
            disabled={isRefreshing}
            onClick={() => void loadFacility(false)}
            type="button"
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <span className={`realtime-state ${realtimeStatus}`}>
            Live {realtimeStatus}
          </span>
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
                    <span className={`status ${space.status}`}>
                      {titleCase(space.status)}
                    </span>
                    <p>{space.note}</p>
                    {space.calendarUrl && (
                      <a
                        className="source-link"
                        href={space.calendarUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Blue Gym calendar
                      </a>
                    )}
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
                    <button
                      className="secondary-button"
                      onClick={() => startReport('space', space.id, 'schedule_mismatch')}
                      type="button"
                    >
                      Report space
                    </button>
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
            <div className="filters" aria-label="Equipment filters">
              <label>
                Floor
                <select
                  onChange={(event) => setFloorFilter(event.target.value)}
                  value={floorFilter}
                >
                  <option value="all">All floors</option>
                  {floors.map((floor) => (
                    <option key={floor} value={floor}>
                      {floorName(floor)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select
                  onChange={(event) => setStatusFilter(event.target.value)}
                  value={statusFilter}
                >
                  <option value="all">All statuses</option>
                  <option value="available">Available</option>
                  <option value="limited">Limited</option>
                  <option value="broken">Broken</option>
                </select>
              </label>
              <label>
                Category
                <select
                  onChange={(event) => setCategoryFilter(event.target.value)}
                  value={categoryFilter}
                >
                  <option value="all">All categories</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label className="search-filter">
                Search
                <input
                  onChange={(event) => setEquipmentSearch(event.target.value)}
                  placeholder="Bench, cable, treadmill..."
                  value={equipmentSearch}
                />
              </label>
            </div>
            <div className="list">
              {visibleEquipment.map((item) => (
                <article className="row" key={item.id}>
                  <div>
                    <h3>{item.name}</h3>
                    <p>
                      {floorName(item.floor)} - {item.zone}
                    </p>
                  </div>
                  <span className={`status ${item.status}`}>
                    {titleCase(item.status)}
                  </span>
                  <div>
                    <p>{item.summary}</p>
                    {item.lastReportAt && item.lastReportIssueType && (
                      <p className="row-meta">
                        Signal: {titleCase(item.lastReportIssueType)} ·{' '}
                        {formatDateTime(item.lastReportAt)}
                        {typeof item.statusScore === 'number' &&
                          ` · score ${item.statusScore}`}
                      </p>
                    )}
                  </div>
                  <button
                    className="secondary-button"
                    onClick={() =>
                      startReport(
                        'equipment',
                        item.id,
                        item.status === 'broken' ? 'fixed' : 'broken',
                        item.status === 'broken' ? 'Working again.' : '',
                      )
                    }
                    type="button"
                  >
                    {item.status === 'broken' ? 'Mark fixed' : 'Report'}
                  </button>
                </article>
              ))}
              {visibleEquipment.length === 0 && (
                <div className="empty-state">No equipment matches those filters.</div>
              )}
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
              Reports update equipment status and show up in the activity feed.
            </p>
          </div>
          <form className="form-card" onSubmit={submitReport}>
            <div className="posting-summary">
              <span>{signedInEmail ? 'Posting as' : 'Posting requires login'}</span>
              <strong>
                {signedInEmail || 'Sign in from Profile with a Columbia email'}
              </strong>
            </div>
            <label>
              Target
              <select
                onChange={(event) => changeReportTarget(event.target.value)}
                required
                value={targetValue}
              >
                <option value="">Select equipment or space</option>
                <optgroup label="Equipment">
                  {snapshot.equipment.map((item) => (
                    <option key={item.id} value={`equipment:${item.id}`}>
                      {item.name} - {floorName(item.floor)}, {titleCase(item.status)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Spaces">
                  {snapshot.spaces.map((space) => (
                    <option key={space.id} value={`space:${space.id}`}>
                      {space.name} - {titleCase(space.status)}
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
                {reportIssueOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
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
            <label className="wide-field">
              Photo
              <input
                accept="image/png,image/jpeg,image/webp,image/heic"
                key={photoInputKey}
                onChange={(event) => setReportPhoto(event.target.files?.[0] ?? null)}
                type="file"
              />
            </label>
            <button disabled={!signedInEmail || isUploadingPhoto} type="submit">
              {isUploadingPhoto ? 'Uploading...' : 'Add report'}
            </button>
            {formMessage && <p className="form-message">{formMessage}</p>}
          </form>
        </section>
      )}

      {activeTab === 'schedule' && (
        <section className="section">
          <div className="section-heading">
            <p className="eyebrow">Upcoming activity · Eastern time</p>
            <h2>Schedule</h2>
          </div>
          <div className="list">
            {snapshot.scheduleBlocks
              .slice()
              .sort(
                (first, second) =>
                  new Date(first.startsAt).getTime() -
                  new Date(second.startsAt).getTime(),
              )
              .map((block) => (
                <article className="row schedule-row" key={block.id}>
                  <div>
                    <h3>{block.activity}</h3>
                    <p>{targetNames.get(block.spaceId) ?? block.spaceId}</p>
                  </div>
                  <p>{formatDateTime(block.startsAt)}</p>
                  <p>
                    {formatTime(block.startsAt)} - {formatTime(block.endsAt)}
                  </p>
                </article>
              ))}
          </div>
        </section>
      )}

      {activeTab === 'activity' && (
        <section className="section">
          <div className="section-heading split-heading">
            <div>
              <p className="eyebrow">Reports need discussion</p>
              <h2>Reports and comments</h2>
            </div>
            <div className="segmented-control" aria-label="Activity time range">
              {(['24', '48', 'all'] as ActivityWindow[]).map((window) => (
                <button
                  className={activityWindow === window ? 'active' : ''}
                  key={window}
                  onClick={() => setActivityWindow(window)}
                  type="button"
                >
                  {window === 'all' ? 'All' : `${window}h`}
                </button>
              ))}
            </div>
          </div>
          <div className="grid">
            {visibleReports.length === 0 && (
              <div className="empty-state">No activity in {activityLabel}.</div>
            )}
            {visibleReports.map((report) => {
              const comments = snapshot.comments.filter(
                (comment) => comment.reportId === report.id,
              )

              return (
                <article className="card" key={report.id}>
                  <p className="eyebrow">{humanize(report.issueType)}</p>
                  <h3>{targetNames.get(report.targetId) ?? report.targetId}</h3>
                  <p>{report.body}</p>
                  {report.photoUrl && (
                    <a
                      className="report-photo"
                      href={report.photoUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <img alt="Report attachment" src={report.photoUrl} />
                    </a>
                  )}
                  <p className="report-meta">
                    {report.authorName} · {formatDateTime(report.createdAt)}
                    {typeof report.weightedScore === 'number' &&
                      ` · score ${report.weightedScore}`}
                  </p>
                  <div className="vote-actions" aria-label="Report votes">
                    <button
                      className={report.viewerVote === 'confirm' ? 'active' : ''}
                      disabled={!signedInEmail}
                      onClick={() => void submitVote(report.id, 'confirm')}
                      type="button"
                    >
                      Confirm {report.confirmCount ?? 0}
                    </button>
                    <button
                      className={report.viewerVote === 'dispute' ? 'active' : ''}
                      disabled={!signedInEmail}
                      onClick={() => void submitVote(report.id, 'dispute')}
                      type="button"
                    >
                      Dispute {report.disputeCount ?? 0}
                    </button>
                  </div>
                  <div className="comments">
                    {comments.map((comment) => (
                      <p key={comment.id}>
                        <strong>{comment.authorName}</strong>
                        {comment.body}
                      </p>
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
                      disabled={!signedInEmail}
                      placeholder={
                        signedInEmail ? `Add a comment as ${displayName}` : 'Sign in to comment'
                      }
                      required
                      value={commentBodies[report.id] ?? ''}
                    />
                    <button disabled={!signedInEmail} type="submit">
                      Post
                    </button>
                  </form>
                </article>
              )
            })}
          </div>
        </section>
      )}

      {activeTab === 'profile' && (
        <section className="section">
          <div className="section-heading">
            <p className="eyebrow">
              {signedInEmail ? 'Columbia account' : 'Columbia login'}
            </p>
            <h2>Profile</h2>
            <p className="section-note">
              {signedInEmail
                ? 'Your reports and comments post with this verified email.'
                : 'Sign in once with your Columbia email before posting reports or comments.'}
            </p>
          </div>
          <div className="profile-card">
            {signedInEmail ? (
              <div className="auth-panel">
                <p className="eyebrow">Signed in</p>
                <strong>{signedInEmail}</strong>
                <button onClick={signOut} type="button">
                  Sign out
                </button>
              </div>
            ) : (
              <form className="auth-panel" onSubmit={submitAuthEmail}>
                <p className="eyebrow">Columbia login</p>
                <label>
                  Email
                  <input
                    onChange={(event) => setAuthEmail(event.target.value)}
                    placeholder="uni@columbia.edu"
                    type="email"
                    value={authEmail}
                  />
                </label>
                <button disabled={isSendingAuthEmail} type="submit">
                  {isSendingAuthEmail ? 'Sending...' : 'Email login link'}
                </button>
                {authMessage && <p>{authMessage}</p>}
              </form>
            )}
            <div className="profile-stats">
              <div>
                <strong>{ownReportCount}</strong>
                <span>reports</span>
              </div>
              <div>
                <strong>{ownCommentCount}</strong>
                <span>comments</span>
              </div>
            </div>
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

function floorName(floor: number) {
  if (floor === 1) return 'Bottom floor'
  if (floor === 2) return 'Second floor'
  if (floor === 3) return 'Top floor'
  return `Floor ${floor}`
}

function isWithinHours(value: string, hours: number) {
  const timestamp = new Date(value).getTime()

  return Date.now() - timestamp <= hours * 60 * 60 * 1000
}

function sanitizeFileName(value: string) {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9.]+/g, '-')

  return cleaned.replace(/^-+|-+$/g, '') || 'report-photo'
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: DISPLAY_TIME_ZONE,
  }).format(new Date(value))
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: DISPLAY_TIME_ZONE,
  }).format(new Date(value))
}

export default App
