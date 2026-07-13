import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;
const BLUE_GYM_ICS_URL =
  'https://calendar.google.com/calendar/ical/cuperec%40gmail.com/public/basic.ics';

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
    {
      id: 'ellipticals',
      name: 'Ellipticals',
      floor: 1,
      zone: 'Cardio deck',
      category: 'Cardio',
      status: 'available',
      summary: '8 of 9 working',
    },
    {
      id: 'cable-stack',
      name: 'Cable Stack',
      floor: 1,
      zone: 'Strength area',
      category: 'Strength',
      status: 'limited',
      summary: 'Left pulley feels sticky',
    },
    {
      id: 'leg-press',
      name: 'Leg Press',
      floor: 2,
      zone: 'Strength area',
      category: 'Strength',
      status: 'available',
      summary: 'Working normally',
    },
    {
      id: 'stretching-mats',
      name: 'Stretching Mats',
      floor: 2,
      zone: 'Functional training',
      category: 'Accessories',
      status: 'limited',
      summary: 'Several mats missing from rack',
    },
  ],
  reports: [
    {
      id: 'report-squat-rack-pin',
      targetType: 'equipment',
      targetId: 'squat-rack-4',
      issueType: 'broken',
      authorName: 'Alex',
      body: 'The right safety pin is missing.',
      createdAt: '2026-07-13T18:42:00-04:00',
    },
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
      id: 'comment-squat-rack-confirm',
      reportId: 'report-squat-rack-pin',
      authorName: 'Jordan',
      body: 'Confirmed, still missing as of 7:10 PM.',
      createdAt: '2026-07-13T19:10:00-04:00',
    },
    {
      id: 'comment-blue-gym-context',
      reportId: 'report-blue-gym-lines',
      authorName: 'Sam',
      body: 'Looks like volleyball ends at 8 PM.',
      createdAt: '2026-07-13T19:12:00-04:00',
    },
  ],
};

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

type ScheduleBlock = {
  id: string;
  spaceId: string;
  activity: string;
  startsAt: string;
  endsAt: string;
};

let blueGymCalendarCache:
  | { expiresAt: number; blocks: ScheduleBlock[] }
  | null = null;

app.get('/api/facility', async (_req, res) => {
  const currentTime = new Date();
  const scheduleBlocks = await getScheduleBlocks(currentTime);

  res.json({
    ...snapshot,
    facility: {
      ...snapshot.facility,
      ...getFacilityAvailability(currentTime),
    },
    scheduleBlocks,
    spaceStatuses: buildSpaceStatuses(scheduleBlocks, currentTime),
  });
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
  const { targetType, targetId, issueType, body, authorName } = req.body;
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
    authorName: cleanAuthorName(authorName),
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

  if (targetType === 'equipment' && issueType === 'fixed') {
    const equipment = snapshot.equipment.find((item) => item.id === targetId);

    if (equipment) {
      equipment.status = 'available';
      equipment.summary = report.body;
    }
  }

  res.status(201).json(report);
});

app.post('/api/reports/:id/comments', (req, res) => {
  const report = snapshot.reports.find((item) => item.id === req.params.id);
  const { body, authorName } = req.body;

  if (!report || typeof body !== 'string' || body.trim().length === 0) {
    res.status(400).json({ error: 'Invalid comment' });
    return;
  }

  const comment = {
    id: `comment-${Date.now()}`,
    reportId: report.id,
    authorName: cleanAuthorName(authorName),
    body: body.trim(),
    createdAt: new Date().toISOString(),
  };

  snapshot.comments.push(comment);
  res.status(201).json(comment);
});

app.listen(PORT, () => {
  console.log(`Gym tracker API listening on port ${PORT}`);
});

function cleanAuthorName(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : 'Anonymous';
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
