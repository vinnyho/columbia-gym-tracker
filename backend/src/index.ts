import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

app.use(helmet());
app.use(cors());
app.use(express.json());

const snapshot = {
  facility: {
    id: 'levien-gym',
    name: 'Levien Gym',
    status: 'open',
    hoursLabel: 'Open until 10:00 PM',
    timezone: 'America/New_York',
  },
  spaces: [
    {
      id: 'blue-gym',
      name: 'Blue Gym',
      kind: 'multi_purpose_court',
      location: 'Level 1',
    },
    {
      id: 'squash-court-1',
      name: 'Squash Court 1',
      kind: 'squash_court',
      location: 'Level 2',
    },
    {
      id: 'squash-court-2',
      name: 'Squash Court 2',
      kind: 'squash_court',
      location: 'Level 2',
    },
  ],
  scheduleBlocks: [
    {
      id: 'blue-gym-basketball-evening',
      spaceId: 'blue-gym',
      activity: 'Open Rec Basketball',
      startsAt: '2026-07-13T18:00:00-04:00',
      endsAt: '2026-07-13T21:30:00-04:00',
    },
    {
      id: 'blue-gym-volleyball-tomorrow',
      spaceId: 'blue-gym',
      activity: 'Volleyball',
      startsAt: '2026-07-14T18:00:00-04:00',
      endsAt: '2026-07-14T20:00:00-04:00',
    },
    {
      id: 'squash-court-1-open-play',
      spaceId: 'squash-court-1',
      activity: 'Open Squash',
      startsAt: '2026-07-13T19:00:00-04:00',
      endsAt: '2026-07-13T20:30:00-04:00',
    },
  ],
  equipment: [
    {
      id: 'treadmills',
      name: 'Treadmills',
      floor: 1,
      zone: 'Cardio deck',
      category: 'Cardio',
      status: 'limited',
      summary: '5 of 12 working',
    },
    {
      id: 'squat-rack-4',
      name: 'Squat Rack #4',
      floor: 1,
      zone: 'Strength area',
      category: 'Strength',
      status: 'broken',
      summary: 'Safety pin missing',
    },
    {
      id: 'rowing-machines',
      name: 'Rowing Machines',
      floor: 2,
      zone: 'Cardio corner',
      category: 'Cardio',
      status: 'available',
      summary: '6 of 7 working',
    },
  ],
  reports: [
    {
      id: 'report-squat-rack-pin',
      targetType: 'equipment',
      targetId: 'squat-rack-4',
      issueType: 'broken',
      body: 'The right safety pin is missing.',
      createdAt: '2026-07-13T18:42:00-04:00',
    },
    {
      id: 'report-blue-gym-lines',
      targetType: 'space',
      targetId: 'blue-gym',
      issueType: 'schedule_mismatch',
      body: 'Court is set up for volleyball, not basketball.',
      createdAt: '2026-07-13T18:55:00-04:00',
    },
  ],
  comments: [
    {
      id: 'comment-squat-rack-confirm',
      reportId: 'report-squat-rack-pin',
      body: 'Confirmed, still missing as of 7:10 PM.',
      createdAt: '2026-07-13T19:10:00-04:00',
    },
    {
      id: 'comment-blue-gym-context',
      reportId: 'report-blue-gym-lines',
      body: 'Looks like volleyball ends at 8 PM.',
      createdAt: '2026-07-13T19:12:00-04:00',
    },
  ],
};

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/facility', (_req, res) => {
  res.json(snapshot);
});

app.get('/api/spaces', (_req, res) => {
  res.json(snapshot.spaces);
});

app.get('/api/equipment', (_req, res) => {
  res.json(snapshot.equipment);
});

app.get('/api/reports', (_req, res) => {
  res.json({
    reports: snapshot.reports,
    comments: snapshot.comments,
  });
});

app.post('/api/reports', (req, res) => {
  const { targetType, targetId, issueType, body } = req.body;
  const targetList = targetType === 'space' ? snapshot.spaces : snapshot.equipment;
  const targetExists = targetList.some((target) => target.id === targetId);

  if (
    (targetType !== 'equipment' && targetType !== 'space') ||
    typeof targetId !== 'string' ||
    typeof issueType !== 'string' ||
    typeof body !== 'string' ||
    body.trim().length === 0 ||
    !targetExists
  ) {
    res.status(400).json({ error: 'Invalid report' });
    return;
  }

  const report = {
    id: `report-${Date.now()}`,
    targetType,
    targetId,
    issueType,
    body: body.trim(),
    createdAt: new Date().toISOString(),
  };

  snapshot.reports.unshift(report);

  if (
    targetType === 'equipment' &&
    (issueType === 'broken' || issueType === 'missing_parts')
  ) {
    const equipment = snapshot.equipment.find((item) => item.id === targetId);

    if (equipment) {
      equipment.status = 'broken';
      equipment.summary = report.body;
    }
  }

  res.status(201).json(report);
});

app.post('/api/reports/:id/comments', (req, res) => {
  const report = snapshot.reports.find((item) => item.id === req.params.id);
  const { body } = req.body;

  if (!report || typeof body !== 'string' || body.trim().length === 0) {
    res.status(400).json({ error: 'Invalid comment' });
    return;
  }

  const comment = {
    id: `comment-${Date.now()}`,
    reportId: report.id,
    body: body.trim(),
    createdAt: new Date().toISOString(),
  };

  snapshot.comments.push(comment);
  res.status(201).json(comment);
});

app.listen(PORT, () => {
  console.log(`Gym tracker API listening on port ${PORT}`);
});
