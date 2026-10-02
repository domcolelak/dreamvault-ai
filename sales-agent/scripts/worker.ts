/**
 * Long-running worker. An alternative to calling POST /api/jobs/tick from cron:
 *
 *   npm run worker
 *
 * It schedules due sends for active automatic campaigns, drains the job queue and
 * periodically syncs the inbox. Several workers can run at once — claiming a job
 * is a conditional update, so no job is ever processed twice.
 */
import { syncInbox } from '../src/lib/agent/imap-sync';
import { tick } from '../src/lib/agent/runner';
import { scheduleSends } from '../src/lib/agent/scheduler';
import { prisma } from '../src/lib/db';
import { errorMessage } from '../src/lib/logger';

const TICK_INTERVAL_MS = Number.parseInt(process.env.WORKER_TICK_SECONDS ?? '20', 10) * 1000;
const IMAP_INTERVAL_MS = Number.parseInt(process.env.WORKER_IMAP_SECONDS ?? '300', 10) * 1000;

let stopping = false;
let lastImapSync = 0;

function log(message: string): void {
  console.log(`[worker ${new Date().toISOString()}] ${message}`);
}

async function cycle(): Promise<void> {
  const active = await prisma.campaign.findMany({
    where: { status: 'ACTIVE', sendingMode: 'AUTOMATIC' },
    select: { id: true, name: true },
  });
  for (const campaign of active) {
    const outcome = await scheduleSends(campaign.id);
    if (outcome.scheduled > 0) log(`${campaign.name}: ${outcome.reason}`);
  }

  const result = await tick(10);
  if (result.processed > 0) {
    log(`processed ${result.processed} job(s): ${result.succeeded} ok, ${result.failed} failed`);
    for (const detail of result.details) {
      log(`  ${detail.ok ? 'ok ' : 'ERR'} ${detail.type} — ${detail.note}`);
    }
  }

  if (Date.now() - lastImapSync >= IMAP_INTERVAL_MS) {
    lastImapSync = Date.now();
    const sync = await syncInbox();
    if (sync.configured && (sync.stored > 0 || sync.replies > 0)) log(sync.detail);
  }
}

async function main(): Promise<void> {
  log(`started; tick every ${TICK_INTERVAL_MS / 1000}s, IMAP every ${IMAP_INTERVAL_MS / 1000}s`);

  while (!stopping) {
    try {
      await cycle();
    } catch (error) {
      log(`cycle failed: ${errorMessage(error)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, TICK_INTERVAL_MS));
  }

  await prisma.$disconnect();
  log('stopped');
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    log(`${signal} received; finishing the current cycle`);
    stopping = true;
  });
}

void main();
