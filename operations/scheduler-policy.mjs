export function zoned(date, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).map((part) => [part.type, part.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

const minutes = (value) => value.split(':').reduce((hours, minute) => hours * 60 + Number(minute), 0);

export function dueSlot(now, timeZone, slots, catchUp = 14) {
  const clock = zoned(now, timeZone);
  const slot = [...slots].reverse().find((value) => { const elapsed = minutes(clock.time) - minutes(value); return elapsed >= 0 && elapsed <= catchUp; });
  return slot ? { ...clock, slot } : null;
}

export function deferredRetry(now, {timeZone,slots}, state, platform, maximumAgeMinutes = 45) {
  const clock = zoned(now, timeZone);
  for (const slot of [...slots].reverse()) {
    const elapsed = minutes(clock.time) - minutes(slot);
    const previous = state[`${platform}:${clock.day}:${slot}`];
    if (elapsed >= 0 && elapsed <= maximumAgeMinutes && previous?.status === 'DEFERRED_ALIEXPRESS_API_LIMIT' && Date.parse(previous.nextAttemptAt || 0) <= now.getTime()) return { ...clock, slot };
  }
  return null;
}
