/**
 * Budget arithmetic (section 3.2, 7.5) — pure, so the guard, the admin page
 * and the tests all use exactly one implementation.
 *
 * Policy: never spend the reserve, and never spend more in one day than the
 * remaining requests divided by the remaining days.
 */

export interface BudgetWindow {
  /** First instant of the month in the budget timezone. */
  start: Date;
  /** First instant of the next month. */
  end: Date;
  /** Last instant of "today" in the budget timezone. */
  dayEnd: Date;
  /** Days left in the month, counting today. */
  daysLeft: number;
  /** YYYY-MM in the budget timezone. */
  month: string;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const PARTS_FORMATTER = (timeZone: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

export function zonedParts(at: Date, timeZone: string): ZonedParts {
  const parts = PARTS_FORMATTER(timeZone).formatToParts(at);
  const read = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour') % 24,
    minute: read('minute'),
  };
}

/** Convert a wall-clock time in `timeZone` to the matching UTC instant. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;
  for (let i = 0; i < 2; i += 1) {
    const parts = zonedParts(new Date(guess), timeZone);
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    guess += target - asUtc;
  }
  return new Date(guess);
}

export function budgetWindow(now: Date, timeZone: string): BudgetWindow {
  const p = zonedParts(now, timeZone);
  const start = zonedTimeToUtc(p.year, p.month, 1, 0, 0, timeZone);
  const nextMonth = p.month === 12 ? { y: p.year + 1, m: 1 } : { y: p.year, m: p.month + 1 };
  const end = zonedTimeToUtc(nextMonth.y, nextMonth.m, 1, 0, 0, timeZone);
  const dayStart = zonedTimeToUtc(p.year, p.month, p.day, 0, 0, timeZone);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const daysInMonth = new Date(Date.UTC(nextMonth.y, nextMonth.m - 1, 0)).getUTCDate();

  return {
    start,
    end,
    dayEnd,
    daysLeft: Math.max(1, daysInMonth - p.day + 1),
    month: `${p.year}-${String(p.month).padStart(2, '0')}`,
  };
}

/** floor((remaining - reserve) / days left), never negative. */
export function dailyAllowance(remaining: number, reserve: number, daysLeft: number): number {
  const spendable = remaining - reserve;
  if (spendable <= 0) return 0;
  return Math.floor(spendable / Math.max(1, daysLeft));
}

/**
 * The allowance for the whole of today.
 *
 * Spending during the day lowers `remaining`, which would otherwise shrink the
 * allowance under our own feet (a ratchet that halves the usable budget). The
 * day's share is therefore measured from what was left when the day began:
 * remaining now, plus what we already spent today.
 */
export function todayAllowance(input: {
  remaining: number;
  usedToday: number;
  reserve: number;
  daysLeft: number;
}): number {
  return dailyAllowance(input.remaining + input.usedToday, input.reserve, input.daysLeft);
}

export interface SpendDecision {
  allowed: boolean;
  reason?: 'reserve' | 'daily-allowance';
  dailyAllowance: number;
  remaining: number;
}

/** One place decides whether a request may be spent right now. */
export function canSpend(input: {
  used: number;
  dailyUsed: number;
  cap: number;
  reserve: number;
  daysLeft: number;
}): SpendDecision {
  const remaining = Math.max(0, input.cap - input.used);
  const allowance = todayAllowance({
    remaining,
    usedToday: input.dailyUsed,
    reserve: input.reserve,
    daysLeft: input.daysLeft,
  });
  if (remaining - 1 < input.reserve) {
    return { allowed: false, reason: 'reserve', dailyAllowance: allowance, remaining };
  }
  if (input.dailyUsed + 1 > allowance) {
    return { allowed: false, reason: 'daily-allowance', dailyAllowance: allowance, remaining };
  }
  return { allowed: true, dailyAllowance: allowance, remaining };
}
