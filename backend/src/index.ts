import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import type { Request } from 'express';
import helmet from 'helmet';
import { Pool } from 'pg';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

dotenv.config();

const app = express();
const BLUE_GYM_ICS_URL =
  'https://calendar.google.com/calendar/ical/cuperec%40gmail.com/public/basic.ics';
const SUPABASE_URL = process.env.SUPABASE_URL?.trim();
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
const AWS_REGION = process.env.AWS_REGION?.trim();
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME?.trim();
const equipmentIssueTypes = new Set(['broken', 'fixed', 'cleanliness', 'missing_parts']);
const spaceIssueTypes = new Set(['schedule_mismatch', 'cleanliness']);
const reportVoteValues = new Set(['confirm', 'dispute']);
const allowedPhotoTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);
const databaseUrl = process.env.DATABASE_URL?.trim();
const databasePool =
  databaseUrl && !databaseUrl.includes('user:password@localhost')
    ? new Pool({
        connectionString: databaseUrl,
        ssl: shouldUseDatabaseSsl(databaseUrl)
          ? { rejectUnauthorized: false }
          : undefined,
      })
    : null;
const s3Client =
  AWS_REGION && S3_BUCKET_NAME
    ? new S3Client({ region: AWS_REGION })
    : null;
let publishRealtimeUpdate: (payload: RealtimeUpdate) => Promise<void> | void = () =>
  undefined;

app.use(helmet());
app.use(cors());
app.use(express.json());

const snapshot = {
  facility: {
    id: 'dodge-fitness-center',
    name: 'Dodge Fitness Center',
    status: 'open',
    hoursLabel: 'Summer hours: Mon-Fri 6 AM-10 PM, Sat-Sun 8 AM-8 PM',
    timezone: 'America/New_York',
    sourceUrl: 'https://perec.columbia.edu/hours-operation',
  },
  spaces: [
    {
      id: 'blue-gym',
      name: 'Blue Gym',
      kind: 'multi_purpose_court',
      location: 'Level 1',
      status: 'open',
      note: 'Activity changes by open recreation calendar.',
      calendarUrl:
        'https://calendar.google.com/calendar/embed?height=600&wkst=1&bgcolor=%2399caea&ctz=America%2FNew_York&title=Blue%20Gym&mode=WEEK&showCalendars=0&showPrint=0&showTitle=0&src=Y3VwZXJlY0BnbWFpbC5jb20&color=%23F6BF26',
    },
    {
      id: 'levien-gymnasium',
      name: 'Levien Gymnasium',
      kind: 'gymnasium',
      location: 'Level 2',
      status: 'closed',
      note: 'Closed until further notice beginning April 27 due to water damage repairs.',
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
  ],
  equipment: [
    {
      id: 'bottom-treadmills',
      name: 'Treadmills',
      floor: 1,
      zone: 'Bottom floor cardio',
      category: 'Cardio',
      status: 'available',
      summary: '9 treadmills',
    },
    {
      id: 'bottom-single-cables',
      name: 'Single Cable Stations',
      floor: 1,
      zone: 'Bottom floor strength',
      category: 'Strength',
      status: 'available',
      summary: '2 single cable stations',
    },
    {
      id: 'bottom-double-cables',
      name: 'Double Cable Setups',
      floor: 1,
      zone: 'Bottom floor strength',
      category: 'Strength',
      status: 'available',
      summary: '2 double cable setups',
    },
    {
      id: 'bottom-benches',
      name: 'Benches',
      floor: 1,
      zone: 'Bottom floor free weights',
      category: 'Strength',
      status: 'available',
      summary: '3 benches',
    },
    {
      id: 'bottom-squat-rack',
      name: 'Squat Rack',
      floor: 1,
      zone: 'Bottom floor free weights',
      category: 'Strength',
      status: 'available',
      summary: 'Working normally',
    },
    {
      id: 'second-hip-thrust',
      name: 'Machine Hip Thrust',
      floor: 2,
      zone: 'Second floor machines',
      category: 'Strength',
      status: 'available',
      summary: 'Working normally',
    },
    {
      id: 'second-t-bar-row',
      name: 'T-Bar Row',
      floor: 2,
      zone: 'Second floor strength',
      category: 'Strength',
      status: 'available',
      summary: 'Working normally',
    },
    {
      id: 'second-seated-cable-row',
      name: 'Seated Cable Machine',
      floor: 2,
      zone: 'Second floor machines',
      category: 'Strength',
      status: 'available',
      summary: 'Seated cable row machine',
    },
    {
      id: 'second-lat-pulldown',
      name: 'Lat Pulldown',
      floor: 2,
      zone: 'Second floor machines',
      category: 'Strength',
      status: 'available',
      summary: 'Working normally',
    },
    {
      id: 'second-cable-pulleys',
      name: 'Cable Pulleys',
      floor: 2,
      zone: 'Second floor strength',
      category: 'Strength',
      status: 'available',
      summary: '2 cable pulley stations',
    },
    {
      id: 'second-leg-press',
      name: 'Leg Press',
      floor: 2,
      zone: 'Second floor machines',
      category: 'Strength',
      status: 'available',
      summary: 'Working normally',
    },
    {
      id: 'second-squat-stations',
      name: 'Squat Stations',
      floor: 2,
      zone: 'Second floor free weights',
      category: 'Strength',
      status: 'available',
      summary: '2 squat stations',
    },
    {
      id: 'second-bench-press',
      name: 'Bench Press Stations',
      floor: 2,
      zone: 'Second floor free weights',
      category: 'Strength',
      status: 'available',
      summary: '4 bench press stations',
    },
    {
      id: 'second-benches',
      name: 'Benches',
      floor: 2,
      zone: 'Second floor free weights',
      category: 'Strength',
      status: 'available',
      summary: '4 benches',
    },
    {
      id: 'second-seated-calf-raise',
      name: 'Seated Calf Raise',
      floor: 2,
      zone: 'Second floor machines',
      category: 'Strength',
      status: 'available',
      summary: 'Working normally',
    },
    {
      id: 'second-smith-machine',
      name: 'Smith Machine',
      floor: 2,
      zone: 'Second floor strength',
      category: 'Strength',
      status: 'available',
      summary: 'Working normally',
    },
    {
      id: 'top-machine-row',
      name: 'Machine Row',
      floor: 3,
      zone: 'Top floor machines',
      category: 'Strength',
      status: 'available',
      summary: 'Working normally',
    },
    {
      id: 'top-assisted-pullup-dip',
      name: 'Assisted Pull-Up / Dip Bar',
      floor: 3,
      zone: 'Top floor machines',
      category: 'Strength',
      status: 'available',
      summary: 'Working normally',
    },
    {
      id: 'top-low-back',
      name: 'Low Back Machine',
      floor: 3,
      zone: 'Top floor machines',
      category: 'Strength',
      status: 'available',
      summary: 'Working normally',
    },
    {
      id: 'top-chest-fly',
      name: 'Chest Fly Machine',
      floor: 3,
      zone: 'Top floor machines',
      category: 'Strength',
      status: 'available',
      summary: 'Working normally',
    },
    {
      id: 'top-hip-abductor',
      name: 'Hip Abductor',
      floor: 3,
      zone: 'Top floor machines',
      category: 'Strength',
      status: 'available',
      summary: 'Working normally',
    },
    {
      id: 'top-hip-adductor',
      name: 'Hip Adductor',
      floor: 3,
      zone: 'Top floor machines',
      category: 'Strength',
      status: 'available',
      summary: 'Working normally',
    },
    {
      id: 'top-leg-extension',
      name: 'Leg Extension',
      floor: 3,
      zone: 'Top floor machines',
      category: 'Strength',
      status: 'available',
      summary: 'Working normally',
    },
    {
      id: 'top-seated-hamstring-curl',
      name: 'Seated Hamstring Curl',
      floor: 3,
      zone: 'Top floor machines',
      category: 'Strength',
      status: 'available',
      summary: 'Working normally',
    },
    {
      id: 'top-lateral-raise',
      name: 'Machine Lateral Raise',
      floor: 3,
      zone: 'Top floor machines',
      category: 'Strength',
      status: 'available',
      summary: 'Working normally',
    },
    {
      id: 'top-preacher-curl',
      name: 'Machine Preacher Curl',
      floor: 3,
      zone: 'Top floor machines',
      category: 'Strength',
      status: 'available',
      summary: 'Working normally',
    },
    {
      id: 'top-tricep-extension',
      name: 'Machine Tricep Extension',
      floor: 3,
      zone: 'Top floor machines',
      category: 'Strength',
      status: 'available',
      summary: 'Working normally',
    },
    {
      id: 'top-cable-lat-pulldown',
      name: 'Cable Lat Pulldown',
      floor: 3,
      zone: 'Top floor machines',
      category: 'Strength',
      status: 'available',
      summary: 'Working normally',
    },
    {
      id: 'top-treadmills',
      name: 'Treadmills',
      floor: 3,
      zone: 'Top floor cardio',
      category: 'Cardio',
      status: 'available',
      summary: '6 treadmills',
    },
    {
      id: 'top-stairmasters',
      name: 'StairMasters',
      floor: 3,
      zone: 'Top floor cardio',
      category: 'Cardio',
      status: 'available',
      summary: '2 StairMasters',
    },
  ],
  reports: [
    {
      id: 'report-blue-gym-lines',
      targetType: 'space',
      targetId: 'blue-gym',
      issueType: 'schedule_mismatch',
      authorName: 'Maya',
      body: 'Court is set up for volleyball, not basketball.',
      createdAt: '2026-07-13T18:55:00-04:00',
    },
  ],
  comments: [
    {
      id: 'comment-blue-gym-context',
      reportId: 'report-blue-gym-lines',
      authorName: 'Sam',
      body: 'Looks like volleyball ends at 8 PM.',
      createdAt: '2026-07-13T19:12:00-04:00',
    },
  ],
  votes: [],
};

function sendHealth(res: express.Response) {
  res.json({
    ok: true,
    databaseConfigured: Boolean(databasePool),
    authConfigured: Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY),
  });
}

app.get('/health', (_req, res) => {
  sendHealth(res);
});

app.get('/api/health', (_req, res) => {
  sendHealth(res);
});

type ScheduleBlock = {
  id: string;
  spaceId: string;
  activity: string;
  startsAt: string;
  endsAt: string;
};

type Report = {
  id: string;
  targetType: 'equipment' | 'space';
  targetId: string;
  issueType: string;
  authorName: string;
  body: string;
  photoKey?: string;
  photoUrl?: string;
  createdAt: string;
  confirmCount?: number;
  disputeCount?: number;
  weightedScore?: number;
  viewerVote?: 'confirm' | 'dispute';
};

type Comment = {
  id: string;
  reportId: string;
  authorName: string;
  body: string;
  createdAt: string;
};

type ReportVote = {
  reportId: string;
  authorName: string;
  value: 'confirm' | 'dispute';
  createdAt: string;
};

export type RealtimeUpdate = {
  type: 'report_created' | 'comment_created' | 'vote_created' | 'schedule_changed';
  reportId?: string;
  targetType?: 'equipment' | 'space';
  targetId?: string;
  createdAt: string;
};

type ReportRow = {
  id: string;
  target_type: 'equipment' | 'space';
  target_id: string;
  issue_type: string;
  author_name: string;
  body: string;
  photo_key: string | null;
  photo_url: string | null;
  created_at: Date | string;
};

type CommentRow = {
  id: string;
  report_id: string;
  author_name: string;
  body: string;
  created_at: Date | string;
};

type ReportVoteRow = {
  report_id: string;
  author_name: string;
  value: 'confirm' | 'dispute';
  created_at: Date | string;
};

let blueGymCalendarCache:
  | { expiresAt: number; blocks: ScheduleBlock[] }
  | null = null;

app.get('/api/facility', async (req, res) => {
  const currentTime = new Date();
  const scheduleBlocks = await getScheduleBlocks(currentTime);
  const viewer = await getRequestUser(req);

  let reportData: { reports: Report[]; comments: Comment[]; votes: ReportVote[] };

  try {
    reportData = await getReportsSnapshot(viewer?.email);
  } catch (error) {
    console.error('Could not load reports', error);
    res.status(500).json({ error: 'Could not load facility reports' });
    return;
  }

  res.json({
    ...snapshot,
    facility: {
      ...snapshot.facility,
      ...getFacilityAvailability(currentTime),
    },
    equipment: buildEquipmentStatus(reportData.reports),
    reports: reportData.reports,
    comments: reportData.comments,
    scheduleBlocks,
    spaceStatuses: buildSpaceStatuses(scheduleBlocks, currentTime),
  });
});

app.get('/api/spaces', (_req, res) => {
  res.json(snapshot.spaces);
});

app.get('/api/equipment', async (_req, res) => {
  try {
    const { reports } = await getReportsSnapshot();
    res.json(buildEquipmentStatus(reports));
  } catch (error) {
    console.error('Could not load equipment reports', error);
    res.status(500).json({ error: 'Could not load equipment' });
  }
});

app.get('/api/reports', async (req, res) => {
  try {
    const viewer = await getRequestUser(req);
    res.json(await getReportsSnapshot(viewer?.email));
  } catch (error) {
    console.error('Could not load reports', error);
    res.status(500).json({ error: 'Could not load reports' });
  }
});

app.post('/api/report-photo-upload', async (req, res) => {
  const user = await getRequestUser(req);

  if (!user) {
    res.status(401).json({ error: 'Sign in with a Columbia email to upload photos.' });
    return;
  }

  if (!s3Client || !S3_BUCKET_NAME) {
    res.status(503).json({ error: 'S3 uploads are not configured.' });
    return;
  }

  const { fileName, contentType } = req.body;

  if (
    typeof fileName !== 'string' ||
    typeof contentType !== 'string' ||
    !allowedPhotoTypes.has(contentType)
  ) {
    res.status(400).json({ error: 'Invalid photo upload request' });
    return;
  }

  const photoKey = `reports/${slugify(user.email)}/${Date.now()}-${sanitizeFileName(fileName)}`;
  const uploadUrl = await getSignedUrl(
    s3Client,
    new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: photoKey,
      ContentType: contentType,
    }),
    { expiresIn: 5 * 60 },
  );

  res.json({ uploadUrl, photoKey });
});

app.post('/api/reports', async (req, res) => {
  const user = await getRequestUser(req);

  if (!user) {
    res.status(401).json({ error: 'Sign in with a Columbia email to post.' });
    return;
  }

  const { targetType, targetId, issueType, body } = req.body;
  const photoKey =
    typeof req.body.photoKey === 'string' ? req.body.photoKey.trim() : '';
  const photoUrl =
    typeof req.body.photoUrl === 'string' ? req.body.photoUrl.trim() : '';
  const targetList = targetType === 'space' ? snapshot.spaces : snapshot.equipment;
  const targetExists = targetList.some((target) => target.id === targetId);

  if (
    (targetType !== 'equipment' && targetType !== 'space') ||
    typeof targetId !== 'string' ||
    typeof issueType !== 'string' ||
    !isValidIssueType(targetType, issueType) ||
    typeof body !== 'string' ||
    body.trim().length === 0 ||
    (photoKey && !isValidPhotoKey(photoKey, user.email)) ||
    (photoUrl && !isValidPhotoUrl(photoUrl)) ||
    !targetExists
  ) {
    res.status(400).json({ error: 'Invalid report' });
    return;
  }

  const report: Report = {
    id: `report-${Date.now()}`,
    targetType,
    targetId,
    issueType,
    authorName: user.email,
    body: body.trim(),
    ...(photoKey ? { photoKey } : {}),
    ...(photoUrl ? { photoUrl } : {}),
    createdAt: new Date().toISOString(),
  };

  try {
    await saveReport(report);
  } catch (error) {
    console.error('Could not save report', error);
    res.status(500).json({ error: 'Could not save report' });
    return;
  }

  if (!databasePool) {
    snapshot.reports.unshift(report);
  }

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

  if (targetType === 'equipment' && issueType === 'fixed') {
    const equipment = snapshot.equipment.find((item) => item.id === targetId);

    if (equipment) {
      equipment.status = 'available';
      equipment.summary = report.body;
    }
  }

  notifyFacilityUpdate({
    type: 'report_created',
    reportId: report.id,
    targetType,
    targetId,
  });
  res.status(201).json(report);
});

app.post('/api/reports/:id/comments', async (req, res) => {
  const user = await getRequestUser(req);

  if (!user) {
    res.status(401).json({ error: 'Sign in with a Columbia email to comment.' });
    return;
  }

  let report: Report | null;

  try {
    report = await findReport(req.params.id);
  } catch (error) {
    console.error('Could not load report', error);
    res.status(500).json({ error: 'Could not load report' });
    return;
  }

  const { body } = req.body;

  if (!report || typeof body !== 'string' || body.trim().length === 0) {
    res.status(400).json({ error: 'Invalid comment' });
    return;
  }

  const comment: Comment = {
    id: `comment-${Date.now()}`,
    reportId: report.id,
    authorName: user.email,
    body: body.trim(),
    createdAt: new Date().toISOString(),
  };

  try {
    await saveComment(comment);
  } catch (error) {
    console.error('Could not save comment', error);
    res.status(500).json({ error: 'Could not save comment' });
    return;
  }

  if (!databasePool) {
    snapshot.comments.push(comment);
  }

  notifyFacilityUpdate({ type: 'comment_created', reportId: report.id });
  res.status(201).json(comment);
});

app.post('/api/reports/:id/votes', async (req, res) => {
  const user = await getRequestUser(req);

  if (!user) {
    res.status(401).json({ error: 'Sign in with a Columbia email to vote.' });
    return;
  }

  const { value } = req.body;

  if (typeof value !== 'string' || !reportVoteValues.has(value)) {
    res.status(400).json({ error: 'Invalid vote' });
    return;
  }

  let report: Report | null;

  try {
    report = await findReport(req.params.id);
  } catch (error) {
    console.error('Could not load report', error);
    res.status(500).json({ error: 'Could not load report' });
    return;
  }

  if (!report) {
    res.status(404).json({ error: 'Report not found' });
    return;
  }

  const vote: ReportVote = {
    reportId: report.id,
    authorName: user.email,
    value: value as ReportVote['value'],
    createdAt: new Date().toISOString(),
  };

  try {
    await saveReportVote(vote);
  } catch (error) {
    console.error('Could not save vote', error);
    res.status(500).json({ error: 'Could not save vote' });
    return;
  }

  if (!databasePool) {
    const votes = snapshot.votes as ReportVote[];
    const existingIndex = votes.findIndex(
      (item) => item.reportId === vote.reportId && item.authorName === vote.authorName,
    );

    if (existingIndex === -1) {
      votes.push(vote);
    } else {
      votes[existingIndex] = vote;
    }
  }

  notifyFacilityUpdate({
    type: 'vote_created',
    reportId: report.id,
    targetType: report.targetType,
    targetId: report.targetId,
  });
  res.status(201).json(vote);
});

export function setRealtimePublisher(
  publisher: (payload: RealtimeUpdate) => Promise<void> | void,
) {
  publishRealtimeUpdate = publisher;
}

export function publishFacilityUpdate(update: Omit<RealtimeUpdate, 'createdAt'>) {
  notifyFacilityUpdate(update);
}

function shouldUseDatabaseSsl(value: string) {
  return !value.includes('localhost') && !value.includes('127.0.0.1');
}

async function getRequestUser(req: Request) {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return null;
  }

  const authorization = req.header('authorization');

  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        authorization,
      },
    });

    if (!response.ok) {
      return null;
    }

    const user = (await response.json()) as { email?: unknown };
    const email = typeof user.email === 'string' ? user.email.toLowerCase() : '';

    return email.endsWith('@columbia.edu') ? { email } : null;
  } catch (error) {
    console.error('Could not verify Supabase user', error);
    return null;
  }
}

function isValidIssueType(targetType: unknown, issueType: string) {
  if (targetType === 'equipment') {
    return equipmentIssueTypes.has(issueType);
  }

  if (targetType === 'space') {
    return spaceIssueTypes.has(issueType);
  }

  return false;
}

function isValidPhotoUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && value.length <= 1000;
  } catch {
    return false;
  }
}

function isValidPhotoKey(value: string, email: string) {
  return (
    value.startsWith(`reports/${slugify(email)}/`) &&
    !value.includes('..') &&
    value.length <= 500
  );
}

function notifyFacilityUpdate(update: Omit<RealtimeUpdate, 'createdAt'>) {
  Promise.resolve(
    publishRealtimeUpdate({
      ...update,
      createdAt: new Date().toISOString(),
    }),
  ).catch((error) => {
    console.error('Could not publish realtime update', error);
  });
}

async function getReportsSnapshot(viewerEmail?: string) {
  if (!databasePool) {
    const votes = snapshot.votes as ReportVote[];
    const reports = addVoteCounts(snapshot.reports as Report[], votes, viewerEmail);

    return {
      reports: await addReportPhotoUrls(reports),
      comments: snapshot.comments as Comment[],
      votes,
    };
  }

  const [reportResult, commentResult, voteResult] = await Promise.all([
    databasePool.query<ReportRow>(
      `SELECT id, target_type, target_id, issue_type, author_name, body, photo_key, photo_url, created_at
       FROM reports
       ORDER BY created_at DESC`,
    ),
    databasePool.query<CommentRow>(
      `SELECT id, report_id, author_name, body, created_at
       FROM comments
       ORDER BY created_at ASC`,
    ),
    databasePool.query<ReportVoteRow>(
      `SELECT report_id, author_name, value, created_at
       FROM report_votes
       ORDER BY created_at ASC`,
    ),
  ]);
  const votes = voteResult.rows.map(mapReportVoteRow);

  return {
    reports: await addReportPhotoUrls(
      addVoteCounts(reportResult.rows.map(mapReportRow), votes, viewerEmail),
    ),
    comments: commentResult.rows.map(mapCommentRow),
    votes,
  };
}

async function saveReport(report: Report) {
  if (!databasePool) return;

  await databasePool.query(
    `INSERT INTO reports (
      id, target_type, target_id, issue_type, author_name, body, photo_key, photo_url, created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      report.id,
      report.targetType,
      report.targetId,
      report.issueType,
      report.authorName,
      report.body,
      report.photoKey ?? null,
      report.photoUrl ?? null,
      report.createdAt,
    ],
  );
}

async function saveComment(comment: Comment) {
  if (!databasePool) return;

  await databasePool.query(
    `INSERT INTO comments (id, report_id, author_name, body, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      comment.id,
      comment.reportId,
      comment.authorName,
      comment.body,
      comment.createdAt,
    ],
  );
}

async function saveReportVote(vote: ReportVote) {
  if (!databasePool) return;

  await databasePool.query(
    `INSERT INTO report_votes (report_id, author_name, value, created_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (report_id, author_name)
     DO UPDATE SET value = EXCLUDED.value, created_at = EXCLUDED.created_at`,
    [vote.reportId, vote.authorName, vote.value, vote.createdAt],
  );
}

async function findReport(id: string) {
  if (!databasePool) {
    return (snapshot.reports as Report[]).find((item) => item.id === id) ?? null;
  }

  const result = await databasePool.query<ReportRow>(
    `SELECT id, target_type, target_id, issue_type, author_name, body, photo_key, photo_url, created_at
     FROM reports
     WHERE id = $1`,
    [id],
  );

  return result.rows[0] ? mapReportRow(result.rows[0]) : null;
}

function buildEquipmentStatus(reports: Report[]) {
  const equipment = snapshot.equipment.map((item) => ({ ...item }));
  const reportsByTarget = new Map<string, Report[]>();

  for (const report of reports) {
    if (report.targetType !== 'equipment') continue;

    reportsByTarget.set(report.targetId, [
      ...(reportsByTarget.get(report.targetId) ?? []),
      report,
    ]);
  }

  for (const item of equipment) {
    const targetReports = reportsByTarget.get(item.id) ?? [];
    const strongestReport = targetReports
      .slice()
      .sort((first, second) => Math.abs(second.weightedScore ?? 0) - Math.abs(first.weightedScore ?? 0))[0];

    if (!strongestReport) continue;

    const totalScore = targetReports.reduce(
      (sum, report) => sum + (report.weightedScore ?? 0),
      0,
    );

    Object.assign(item, {
      lastReportAt: strongestReport.createdAt,
      lastReportAuthor: strongestReport.authorName,
      lastReportIssueType: strongestReport.issueType,
      statusScore: Number(totalScore.toFixed(2)),
    });

    if (totalScore >= 0.75) {
      item.status = 'broken';
      item.summary = strongestReport.body;
    }

    if (totalScore <= -0.75) {
      item.status = 'available';
      item.summary = strongestReport.body;
    }
  }

  return equipment;
}

function addVoteCounts(reports: Report[], votes: ReportVote[], viewerEmail?: string) {
  return reports.map((report) => {
    const reportVotes = votes.filter((vote) => vote.reportId === report.id);
    const confirmCount = reportVotes.filter((vote) => vote.value === 'confirm').length;
    const disputeCount = reportVotes.filter((vote) => vote.value === 'dispute').length;
    const viewerVote = viewerEmail
      ? reportVotes.find((vote) => vote.authorName === viewerEmail)?.value
      : undefined;

    return {
      ...report,
      confirmCount,
      disputeCount,
      weightedScore: getReportScore(report, confirmCount, disputeCount),
      viewerVote,
    };
  });
}

async function addReportPhotoUrls(reports: Report[]) {
  return Promise.all(
    reports.map(async (report) => {
      if (!report.photoKey || !s3Client || !S3_BUCKET_NAME) {
        return report;
      }

      const photoUrl = await getSignedUrl(
        s3Client,
        new GetObjectCommand({
          Bucket: S3_BUCKET_NAME,
          Key: report.photoKey,
        }),
        { expiresIn: 15 * 60 },
      );

      return { ...report, photoUrl };
    }),
  );
}

function getReportScore(report: Report, confirmCount: number, disputeCount: number) {
  const direction = getReportDirection(report.issueType);

  if (direction === 0) return 0;

  const ageHours =
    (Date.now() - new Date(report.createdAt).getTime()) / (60 * 60 * 1000);
  const timeDecay = Math.pow(0.5, ageHours / 24);
  const voteWeight = 1 + confirmCount * 0.5 - disputeCount * 0.75;

  return Number((direction * Math.max(voteWeight, 0) * timeDecay).toFixed(2));
}

function getReportDirection(issueType: string) {
  if (issueType === 'broken' || issueType === 'missing_parts') return 1;
  if (issueType === 'fixed') return -1;
  return 0;
}

function mapReportRow(row: ReportRow): Report {
  return {
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    issueType: row.issue_type,
    authorName: row.author_name,
    body: row.body,
    ...(row.photo_key ? { photoKey: row.photo_key } : {}),
    ...(row.photo_url ? { photoUrl: row.photo_url } : {}),
    createdAt: formatDatabaseTimestamp(row.created_at),
  };
}

function mapCommentRow(row: CommentRow): Comment {
  return {
    id: row.id,
    reportId: row.report_id,
    authorName: row.author_name,
    body: row.body,
    createdAt: formatDatabaseTimestamp(row.created_at),
  };
}

function mapReportVoteRow(row: ReportVoteRow): ReportVote {
  return {
    reportId: row.report_id,
    authorName: row.author_name,
    value: row.value,
    createdAt: formatDatabaseTimestamp(row.created_at),
  };
}

function formatDatabaseTimestamp(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function getScheduleBlocks(currentTime: Date) {
  const fallbackBlocks = snapshot.scheduleBlocks;
  const now = Date.now();

  if (blueGymCalendarCache && blueGymCalendarCache.expiresAt > now) {
    return [
      ...blueGymCalendarCache.blocks,
      ...fallbackBlocks.filter((block) => block.spaceId !== 'blue-gym'),
    ];
  }

  try {
    const response = await fetch(BLUE_GYM_ICS_URL);

    if (!response.ok) {
      return fallbackBlocks;
    }

    const ics = await response.text();
    const blueGymBlocks = parseBlueGymCalendar(ics, currentTime);

    if (blueGymBlocks.length === 0) {
      return fallbackBlocks;
    }

    blueGymCalendarCache = {
      blocks: blueGymBlocks,
      expiresAt: now + 15 * 60 * 1000,
    };

    return [
      ...blueGymBlocks,
      ...fallbackBlocks.filter((block) => block.spaceId !== 'blue-gym'),
    ];
  } catch {
    return fallbackBlocks;
  }
}

function buildSpaceStatuses(scheduleBlocks: ScheduleBlock[], currentTime: Date) {
  return snapshot.spaces.map((space) => {
    const blocks = scheduleBlocks
      .filter((block) => block.spaceId === space.id)
      .sort(
        (first, second) =>
          new Date(first.startsAt).getTime() - new Date(second.startsAt).getTime(),
      );
    const current = blocks.find(
        (block) =>
          new Date(block.startsAt) <= currentTime &&
          new Date(block.endsAt) > currentTime,
    );
    const next = blocks.find((block) => new Date(block.startsAt) > currentTime);

    return {
      spaceId: space.id,
      current: current ?? null,
      next: next ?? null,
    };
  });
}

function parseBlueGymCalendar(ics: string, currentTime: Date) {
  const windowStart = new Date(currentTime);
  windowStart.setDate(windowStart.getDate() - 1);

  const windowEnd = new Date(currentTime);
  windowEnd.setDate(windowEnd.getDate() + 14);

  return parseIcsEvents(ics)
    .flatMap((event) => expandEvent(event, windowStart, windowEnd))
    .sort(
      (first, second) =>
        new Date(first.startsAt).getTime() - new Date(second.startsAt).getTime(),
    )
    .slice(0, 20);
}

function parseIcsEvents(ics: string) {
  const lines = unfoldIcsLines(ics);
  const events: Record<string, string>[] = [];
  let event: Record<string, string> | null = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      event = {};
    } else if (line === 'END:VEVENT' && event) {
      events.push(event);
      event = null;
    } else if (event) {
      const separator = line.indexOf(':');

      if (separator !== -1) {
        const rawKey = line.slice(0, separator);
        const key = rawKey.split(';')[0];
        event[key] = line.slice(separator + 1);
      }
    }
  }

  return events.filter((event) => event.DTSTART && event.DTEND && event.SUMMARY);
}

function unfoldIcsLines(ics: string) {
  const lines: string[] = [];

  for (const line of ics.split(/\r?\n/)) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }

  return lines;
}

function expandEvent(
  event: Record<string, string>,
  windowStart: Date,
  windowEnd: Date,
) {
  const start = parseIcsDate(event.DTSTART);
  const end = parseIcsDate(event.DTEND);

  if (!start || !end || end <= start) {
    return [];
  }

  const duration = end.getTime() - start.getTime();
  const title = event.SUMMARY.replace(/\\,/g, ',');

  if (!event.RRULE) {
    return overlapsWindow(start, end, windowStart, windowEnd)
      ? [makeScheduleBlock(event.UID ?? title, title, start, end)]
      : [];
  }

  const rule = parseRrule(event.RRULE);

  if (rule.FREQ !== 'WEEKLY' || !rule.BYDAY) {
    return [];
  }

  const until = rule.UNTIL ? parseIcsDate(rule.UNTIL) : windowEnd;

  if (!until) {
    return [];
  }

  const days = rule.BYDAY.split(',');
  const blocks: ScheduleBlock[] = [];
  const day = startOfDay(windowStart);

  while (day <= windowEnd && day <= until) {
    if (day >= startOfDay(start) && days.includes(dayCode(day))) {
      const occurrenceStart = dateWithTime(day, start);
      const occurrenceEnd = new Date(occurrenceStart.getTime() + duration);

      if (
        occurrenceStart >= start &&
        occurrenceStart <= until &&
        overlapsWindow(occurrenceStart, occurrenceEnd, windowStart, windowEnd)
      ) {
        blocks.push(
          makeScheduleBlock(
            `${event.UID ?? title}-${occurrenceStart.toISOString()}`,
            title,
            occurrenceStart,
            occurrenceEnd,
          ),
        );
      }
    }

    day.setDate(day.getDate() + 1);
  }

  return blocks;
}

function parseRrule(value: string) {
  return Object.fromEntries(
    value.split(';').map((part) => {
      const [key, ruleValue] = part.split('=');
      return [key, ruleValue];
    }),
  );
}

function parseIcsDate(value: string) {
  const match = value.match(
    /^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?(\d{2})?(Z)?$/,
  );

  if (!match) {
    return null;
  }

  const [, year, month, day, hour = '00', minute = '00', second = '00', zulu] =
    match;

  if (zulu) {
    return new Date(
      `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`,
    );
  }

  return new Date(
    `${year}-${month}-${day}T${hour}:${minute}:${second}${newYorkOffset(
      Number(month),
    )}`,
  );
}

function newYorkOffset(month: number) {
  return month >= 3 && month <= 10 ? '-04:00' : '-05:00';
}

function overlapsWindow(
  start: Date,
  end: Date,
  windowStart: Date,
  windowEnd: Date,
) {
  return start < windowEnd && end > windowStart;
}

function makeScheduleBlock(
  sourceId: string,
  activity: string,
  startsAt: Date,
  endsAt: Date,
) {
  return {
    id: `blue-gym-${slugify(sourceId)}`,
    spaceId: 'blue-gym',
    activity,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
  };
}

function startOfDay(value: Date) {
  const day = new Date(value);
  day.setHours(0, 0, 0, 0);
  return day;
}

function dateWithTime(day: Date, timeSource: Date) {
  const value = new Date(day);
  value.setHours(
    timeSource.getHours(),
    timeSource.getMinutes(),
    timeSource.getSeconds(),
    0,
  );
  return value;
}

function dayCode(value: Date) {
  return ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][value.getDay()];
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function sanitizeFileName(value: string) {
  return (
    value.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '') ||
    'report-photo'
  );
}

function getFacilityAvailability(currentTime: Date) {
  const current = getNewYorkTimeParts(currentTime);
  const todayHours = buildingHoursForDay(current.weekday);
  const currentMinutes = current.hour * 60 + current.minute;

  if (
    currentMinutes >= todayHours.opensAt &&
    currentMinutes < todayHours.closesAt
  ) {
    return {
      status: 'open',
      hoursLabel: `Open until ${formatMinutes(todayHours.closesAt)}`,
    };
  }

  if (currentMinutes < todayHours.opensAt) {
    return {
      status: 'closed',
      hoursLabel: `Closed - opens at ${formatMinutes(todayHours.opensAt)}`,
    };
  }

  const tomorrowHours = buildingHoursForDay((current.weekday + 1) % 7);

  return {
    status: 'closed',
    hoursLabel: `Closed - opens tomorrow at ${formatMinutes(
      tomorrowHours.opensAt,
    )}`,
  };
}

function buildingHoursForDay(weekday: number) {
  const isWeekend = weekday === 0 || weekday === 6;

  return {
    opensAt: isWeekend ? 8 * 60 : 6 * 60,
    closesAt: isWeekend ? 20 * 60 : 22 * 60,
  };
}

function getNewYorkTimeParts(value: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return {
    weekday: weekdays.indexOf(byType.weekday),
    hour: Number(byType.hour),
    minute: Number(byType.minute),
  };
}

function formatMinutes(value: number) {
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;

  if (minute === 0) {
    return `${displayHour}:00 ${period}`;
  }

  return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
}

export default app;
