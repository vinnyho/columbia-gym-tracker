import './App.css'

const facility = {
  name: 'Levien Gym',
  status: 'Open',
  hoursLabel: 'Open until 10:00 PM',
}

const spaces = [
  {
    name: 'Blue Gym',
    kind: 'Multi-purpose court',
    currentUse: 'Open Rec Basketball',
    nextUse: 'Volleyball tomorrow at 6:00 PM',
  },
  {
    name: 'Squash Court 1',
    kind: 'Squash court',
    currentUse: 'Open Squash',
    nextUse: 'No upcoming change listed',
  },
  {
    name: 'Squash Court 2',
    kind: 'Squash court',
    currentUse: 'Reserved practice',
    nextUse: 'Open play after 9:15 PM',
  },
]

const equipment = [
  {
    name: 'Treadmills',
    location: 'Level 1 - Cardio deck',
    status: 'Limited',
    note: '5 of 12 working',
  },
  {
    name: 'Squat Rack #4',
    location: 'Level 1 - Strength area',
    status: 'Broken',
    note: 'Safety pin missing',
  },
  {
    name: 'Rowing Machines',
    location: 'Level 2 - Cardio corner',
    status: 'Available',
    note: '6 of 7 working',
  },
]

const reports = [
  {
    target: 'Squat Rack #4',
    issue: 'Broken',
    body: 'The right safety pin is missing.',
    comments: ['Confirmed, still missing as of 7:10 PM.'],
  },
  {
    target: 'Blue Gym',
    issue: 'Schedule mismatch',
    body: 'Court is set up for volleyball, not basketball.',
    comments: ['Looks like volleyball ends at 8 PM.'],
  },
]

function App() {
  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Gym Facility Tracker</p>
          <h1>{facility.name}</h1>
        </div>
        <div className="facility-state">
          <strong>{facility.status}</strong>
          <span>{facility.hoursLabel}</span>
        </div>
      </header>

      <section className="section">
        <div className="section-heading">
          <p className="eyebrow">Spaces change by time</p>
          <h2>Courts and spaces</h2>
        </div>
        <div className="grid">
          {spaces.map((space) => (
            <article className="card" key={space.name}>
              <p className="eyebrow">{space.kind}</p>
              <h3>{space.name}</h3>
              <dl>
                <div>
                  <dt>Now</dt>
                  <dd>{space.currentUse}</dd>
                </div>
                <div>
                  <dt>Next</dt>
                  <dd>{space.nextUse}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <p className="eyebrow">Equipment has status</p>
          <h2>Equipment</h2>
        </div>
        <div className="list">
          {equipment.map((item) => (
            <article className="row" key={item.name}>
              <div>
                <h3>{item.name}</h3>
                <p>{item.location}</p>
              </div>
              <span className={`status ${item.status.toLowerCase()}`}>
                {item.status}
              </span>
              <p>{item.note}</p>
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
          {reports.map((report) => (
            <article className="card" key={`${report.target}-${report.issue}`}>
              <p className="eyebrow">{report.issue}</p>
              <h3>{report.target}</h3>
              <p>{report.body}</p>
              <div className="comments">
                {report.comments.map((comment) => (
                  <p key={comment}>{comment}</p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}

export default App
