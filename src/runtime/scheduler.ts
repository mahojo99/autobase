import { DateTime } from 'luxon';
import type { Bot, Schedule, ScheduleSpec, Task } from '../shared/contracts';
import { now, Store, uid } from './store';

export function nextOccurrence(spec: ScheduleSpec, after: Date): string | null {
  const current = DateTime.fromJSDate(after, { zone: spec.timezone });
  if (!current.isValid) throw new Error('Use a valid IANA timezone, such as Europe/Oslo.');
  if (spec.kind === 'once') {
    const when = DateTime.fromISO(spec.at, { zone: spec.timezone });
    if (!when.isValid) throw new Error('Use an ISO local date and time.');
    return when.toMillis() > current.toMillis() ? when.toUTC().toISO() : null;
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(spec.at)) throw new Error('Use a 24-hour time, HH:mm.');
  const [hour, minute] = spec.at.split(':').map(Number);
  for (let day = 0; day <= 8; day++) {
    const date = current.startOf('day').plus({ days: day });
    if (spec.kind === 'weekdays' && date.weekday > 5) continue;
    let candidate = date.set({ hour, minute });
    // Spring gaps move to the first valid wall time chosen by Luxon; fall folds fire once, at the earlier offset.
    candidate = candidate.getPossibleOffsets().sort((a, b) => a.toMillis() - b.toMillis())[0];
    if (candidate.toMillis() > current.toMillis()) return candidate.toUTC().toISO();
  }
  throw new Error('Unable to compute the next occurrence.');
}
export function addSchedule(
  store: Store,
  botId: string,
  objective: string,
  spec: ScheduleSpec,
): Schedule {
  store.need<Bot>('bots', botId);
  const nextAt = nextOccurrence(spec, new Date());
  if (!nextAt) throw new Error('The one-off time must be in the future.');
  const s: Schedule = {
    id: uid('schedule'),
    botId,
    objective,
    spec,
    nextAt,
    enabled: true,
    createdAt: now(),
    missed: 0,
  };
  store.put('schedules', s.id, s);
  return s;
}
export function tickSchedules(store: Store, at = new Date()): string[] {
  return store.transaction(() => {
    const queued: string[] = [];
    for (const s of store.all<Schedule>('schedules')) {
      if (!s.enabled || !s.nextAt || new Date(s.nextAt) > at) continue;
      const occurrenceId = `${s.id}@${s.nextAt}`;
      if (store.get('occurrences', occurrenceId)) continue;
      const overlapping = store
        .all<Task>('tasks')
        .some(
          (t) =>
            t.scheduleId === s.id &&
            ['queued', 'running', 'waiting_input', 'waiting_approval', 'waiting_children'].includes(
              t.state,
            ),
        );
      const bot = store.need<Bot>('bots', s.botId);
      let missed = 0;
      let cursor: string | null = s.nextAt;
      // Count missed occurrences up to a bounded horizon; coalesce even very long downtime into one run.
      while (cursor && new Date(cursor) <= at && missed < 366) {
        missed++;
        cursor = nextOccurrence(s.spec, new Date(cursor));
      }
      const task =
        overlapping || bot.archived
          ? null
          : store.createTask(bot, s.objective, { scheduleId: s.id });
      store.occurrence({
        id: occurrenceId,
        scheduleId: s.id,
        taskId: task?.id ?? null,
        dueAt: s.nextAt,
        firedAt: at.toISOString(),
        disposition: overlapping
          ? 'skipped: previous run still active'
          : bot.archived
            ? 'skipped: bot archived'
            : missed > 1
              ? `coalesced ${missed}${missed === 366 ? '+' : ''} occurrences into one catch-up`
              : 'queued',
      });
      s.missed += Math.max(0, missed - 1);
      s.nextAt = nextOccurrence(s.spec, at);
      if (!s.nextAt) s.enabled = false;
      store.put('schedules', s.id, s);
      if (task) queued.push(task.id);
    }
    return queued;
  });
}
