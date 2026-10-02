import { prisma } from '../db';
import { resolveSettings } from '../settings';

/** Local wall-clock parts of a UTC instant, in the configured timezone. */
function zonedParts(date: Date, timeZone: string): { year: number; month: number; day: number; hour: number; minute: number; weekday: string } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  });
  const parts = new Map(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const hour = Number.parseInt(parts.get('hour') ?? '0', 10);
  return {
    year: Number.parseInt(parts.get('year') ?? '1970', 10),
    month: Number.parseInt(parts.get('month') ?? '1', 10),
    day: Number.parseInt(parts.get('day') ?? '1', 10),
    // Intl can emit hour 24 for midnight with hour12:false.
    hour: hour === 24 ? 0 : hour,
    minute: Number.parseInt(parts.get('minute') ?? '0', 10),
    weekday: parts.get('weekday') ?? 'Mon',
  };
}

/** Milliseconds by which the zone is ahead of UTC at the given instant. */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  // The instant truncated to whole minutes, so the two sides are comparable.
  const truncated = Math.floor(date.getTime() / 60_000) * 60_000;
  return asUtc - truncated;
}

/**
 * Start of the current local day as a UTC instant. The offset is measured, not
 * assumed, and then re-measured at the candidate instant so the result stays
 * correct across a DST boundary.
 */
export function startOfLocalDay(now: Date, timeZone: string): Date {
  const parts = zonedParts(now, timeZone);
  const localMidnightAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day);
  const firstGuess = new Date(localMidnightAsUtc - zoneOffsetMs(now, timeZone));
  return new Date(localMidnightAsUtc - zoneOffsetMs(firstGuess, timeZone));
}

export async function countSentToday(campaignId?: string): Promise<{ campaign: number; global: number }> {
  const settings = await resolveSettings();
  const dayStart = startOfLocalDay(new Date(), settings.timezone);

  const global = await prisma.sentEmail.count({ where: { sentAt: { gte: dayStart } } });
  const campaign =
    campaignId !== undefined
      ? await prisma.sentEmail.count({ where: { campaignId, sentAt: { gte: dayStart } } })
      : 0;

  return { campaign, global };
}

export type WorkingHoursState = {
  insideWorkingHours: boolean;
  isWeekend: boolean;
  localHour: number;
  localMinute: number;
  timezone: string;
};

export async function workingHoursState(now = new Date()): Promise<WorkingHoursState> {
  const settings = await resolveSettings();
  const parts = zonedParts(now, settings.timezone);
  const isWeekend = parts.weekday === 'Sat' || parts.weekday === 'Sun';
  const inside =
    !isWeekend && parts.hour >= settings.workingHoursStart && parts.hour < settings.workingHoursEnd;

  return {
    insideWorkingHours: inside,
    isWeekend,
    localHour: parts.hour,
    localMinute: parts.minute,
    timezone: settings.timezone,
  };
}

/** Minutes remaining in today's local sending window, 0 when outside it. */
export async function minutesLeftInWindow(now = new Date()): Promise<number> {
  const settings = await resolveSettings();
  const state = await workingHoursState(now);
  if (!state.insideWorkingHours) return 0;
  return Math.max(0, (settings.workingHoursEnd - state.localHour) * 60 - state.localMinute);
}
