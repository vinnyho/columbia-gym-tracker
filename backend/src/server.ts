import { createServer } from 'node:http';
import { createClient } from 'redis';
import { Server } from 'socket.io';
import app, { publishFacilityUpdate, setRealtimePublisher } from './index.js';
import type { RealtimeUpdate } from './index.js';

const PORT = Number(process.env.PORT ?? 5001);
const REDIS_URL = process.env.REDIS_URL?.trim();
const REALTIME_CHANNEL = 'facility:update';
const server = createServer(app);
const allowedOrigins = (
  process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173,http://127.0.0.1:5173'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
  },
});

io.on('connection', (socket) => {
  socket.emit('facility:ready', { connectedAt: new Date().toISOString() });
});

function emitFacilityUpdate(update: RealtimeUpdate) {
  io.emit(REALTIME_CHANNEL, update);
}

async function startRealtime() {
  if (!REDIS_URL) {
    setRealtimePublisher(emitFacilityUpdate);
    return;
  }

  try {
    const publisher = createClient({ url: REDIS_URL });
    const subscriber = publisher.duplicate();

    publisher.on('error', (error) => {
      console.error('Redis publisher error', error);
    });
    subscriber.on('error', (error) => {
      console.error('Redis subscriber error', error);
    });

    await Promise.all([publisher.connect(), subscriber.connect()]);
    await subscriber.subscribe(REALTIME_CHANNEL, (message) => {
      try {
        emitFacilityUpdate(JSON.parse(message) as RealtimeUpdate);
      } catch (error) {
        console.error('Could not parse realtime message', error);
      }
    });

    setRealtimePublisher(async (update) => {
      await publisher.publish(REALTIME_CHANNEL, JSON.stringify(update));
    });
  } catch (error) {
    console.error('Redis unavailable, using local realtime updates', error);
    setRealtimePublisher(emitFacilityUpdate);
  }
}

void startRealtime();

setInterval(() => {
  publishFacilityUpdate({ type: 'schedule_changed' });
}, 60 * 1000);

server.listen(PORT, () => {
  console.log(`Gym tracker API listening on port ${PORT}`);
});
