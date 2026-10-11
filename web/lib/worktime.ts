// Plans are scored in working hours from hour 0. The calendar maps them onto real dates:
// weekdays only, 9:00-17:00, starting at the plan's `start` (the next working morning).

export const DAY_START = 9;

export function workDayDate(startIso: string, dayIndex: number): Date {
  const d = new Date(startIso);
  let left = dayIndex;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) left--;
  }
  return d;
}

export function workHourToDate(startIso: string, hour: number, hoursPerDay: number): Date {
  // an end time that lands exactly on a day boundary is shown as 17:00 that day, not 9:00 the next
  const atEnd = hour > 0 && hour % hoursPerDay === 0;
  const day = atEnd ? hour / hoursPerDay - 1 : Math.floor(hour / hoursPerDay);
  const into = atEnd ? hoursPerDay : hour % hoursPerDay;
  const d = workDayDate(startIso, day);
  d.setHours(DAY_START + into, 0, 0, 0);
  return d;
}

export const fmtDay = (d: Date) => d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
export const fmtTime = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
export const fmtWhen = (d: Date) => `${fmtDay(d)} ${fmtTime(d)}`;
