/**
 * Kuwait Labor Law calculations (Law 6/2010, Private Sector)
 * References: Articles 51 (EOS), 64 (overtime), 69 (sick leave), 70 (annual leave)
 * Disclaimer: implementation reflects common practice and may need legal review for edge cases.
 */

const DAYS_PER_MONTH = 26;   // working days per month convention for daily wage
const WORKING_HOURS_PER_DAY = 8;

function daysBetween(d1, d2) {
  const ms = new Date(d2).getTime() - new Date(d1).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function r3(n) { return Math.round(Number(n || 0) * 1000) / 1000; }

/**
 * End-of-Service Indemnity (Article 51)
 * - Monthly-paid employees:
 *   * 15 days' wages per year for the first 5 years
 *   * One month's wages per year thereafter
 * - Capped at 1.5 years' total wages
 * - Resignation tiers apply for unlimited contracts
 */
function calculateEndOfService({
  basicSalary,
  hireDate,
  endDate,
  reason = 'termination',
  contractType = 'unlimited',
  includeAllowances = 0,    // optional: amount added to basic for EOS calc
}) {
  if (!basicSalary || !hireDate || !endDate) {
    throw new Error('basicSalary, hireDate, endDate are required');
  }
  const totalDays = daysBetween(hireDate, endDate);
  if (totalDays <= 0) return { years: 0, eos: 0, breakdown: [], capped: false };

  const totalYears = totalDays / 365;
  const wageBase = Number(basicSalary) + Number(includeAllowances || 0);
  const dailyWage = wageBase / DAYS_PER_MONTH;

  const firstPart  = Math.min(totalYears, 5) * 15 * dailyWage;
  const remainder  = Math.max(0, totalYears - 5);
  const secondPart = remainder * DAYS_PER_MONTH * dailyWage;

  let gross = firstPart + secondPart;

  let reductionFactor = 1.0;
  let reductionReason = '';
  if (contractType === 'unlimited' && reason === 'resignation') {
    if (totalYears < 3)       { reductionFactor = 0;     reductionReason = '<3 years service — no EOS'; }
    else if (totalYears < 5)  { reductionFactor = 0.5;   reductionReason = '3–5 years — 50%'; }
    else if (totalYears < 10) { reductionFactor = 2/3;   reductionReason = '5–10 years — two-thirds'; }
    else                      { reductionFactor = 1.0;   reductionReason = '10+ years — full'; }
  }
  if (contractType === 'limited' && reason === 'resignation') {
    reductionFactor = 0;
    reductionReason = 'limited contract early resignation';
  }

  let eos = gross * reductionFactor;

  const cap = wageBase * 18;   // 18 months = 1.5 years
  const capped = eos > cap;
  if (capped) eos = cap;

  return {
    years: Number(totalYears.toFixed(4)),
    total_days: totalDays,
    wage_base: r3(wageBase),
    daily_wage: r3(dailyWage),
    first_5y_amount: r3(firstPart),
    after_5y_amount: r3(secondPart),
    reduction_factor: reductionFactor,
    reduction_reason: reductionReason,
    gross: r3(gross),
    eos: r3(eos),
    capped,
    breakdown: [
      { label: `First 5 years × 15 days × daily wage`,  amount: r3(firstPart) },
      { label: `After 5 years × ${DAYS_PER_MONTH} days × daily wage`, amount: r3(secondPart) },
      ...(reductionFactor !== 1 ? [{ label: `Reduction (${reductionReason})`, amount: reductionFactor }] : []),
      ...(capped ? [{ label: 'Capped at 18 months of wage', amount: r3(cap) }] : []),
    ],
  };
}

/**
 * Annual leave entitlement (Article 70)
 * - 30 calendar days/year after 9 months of service
 * - Pro-rata for partial years
 */
function calculateAnnualLeaveBalance({ hireDate, asOf = new Date(), usedDays = 0 }) {
  const days = daysBetween(hireDate, asOf);
  if (days < 9 * 30) return { entitled: 0, used: usedDays, balance: 0, eligible: false };
  const years = days / 365;
  const entitled = Math.floor(years * 30 * 100) / 100;
  return {
    entitled: Number(entitled.toFixed(2)),
    used: Number(usedDays),
    balance: Number((entitled - usedDays).toFixed(2)),
    eligible: true,
  };
}

/**
 * Sick leave entitlement (Article 69 — Kuwait 2010 amendments)
 * Per calendar year, with medical certificate:
 *   1st  15 days: FULL pay
 *   next 10 days: 75% pay      (changed from "half" in 2010)
 *   next 10 days: 50% pay
 *   next 10 days: 25% pay
 *   next 30 days: 0% (unpaid)
 *
 * Input usedDays array represents already-taken sick leave (in days).
 * Returns breakdown of remaining entitlement and effective pay rate for the next day.
 */
function calculateSickLeaveBalance({ usedDays = 0 }) {
  const tiers = [
    { code: 'full',    days: 15, pay_rate: 1.00 },
    { code: 'p75',     days: 10, pay_rate: 0.75 },
    { code: 'p50',     days: 10, pay_rate: 0.50 },
    { code: 'p25',     days: 10, pay_rate: 0.25 },
    { code: 'unpaid',  days: 30, pay_rate: 0.00 },
  ];
  let used = Number(usedDays);
  const result = [];
  let runningUsed = 0;
  let nextDayPay = null;
  for (const t of tiers) {
    const usedInTier = Math.min(used, t.days);
    const remainingInTier = t.days - usedInTier;
    if (nextDayPay === null && remainingInTier > 0) nextDayPay = t.pay_rate;
    result.push({
      tier: t.code,
      pay_rate: t.pay_rate,
      tier_days: t.days,
      used: usedInTier,
      remaining: remainingInTier,
    });
    used -= usedInTier;
    runningUsed += usedInTier;
  }
  const totalAnnual = tiers.reduce((s, t) => s + t.days, 0);
  return {
    total_annual_entitlement: totalAnnual,
    used_so_far: runningUsed,
    remaining_total: Math.max(0, totalAnnual - runningUsed),
    next_day_pay_rate: nextDayPay ?? 0,
    tiers: result,
  };
}

/**
 * Overtime pay (Article 64)
 *   Standard overtime:    25% above standard hourly rate
 *   Weekly rest / holiday: 50% above standard hourly rate
 *   Full day off in lieu: 100% extra day
 *
 * Inputs:
 *   basicSalary   - monthly
 *   regularHours  - extra weekday hours
 *   weekendHours  - hours worked on weekly rest day or public holiday
 */
function calculateOvertime({ basicSalary, regularHours = 0, weekendHours = 0 }) {
  if (!basicSalary) return { hourly_rate: 0, regular_pay: 0, weekend_pay: 0, total: 0 };
  const hourly = Number(basicSalary) / DAYS_PER_MONTH / WORKING_HOURS_PER_DAY;
  const regularPay = Number(regularHours) * hourly * 1.25;
  const weekendPay = Number(weekendHours) * hourly * 1.5;
  return {
    hourly_rate: r3(hourly),
    regular_hours: Number(regularHours),
    weekend_hours: Number(weekendHours),
    regular_pay: r3(regularPay),
    weekend_pay: r3(weekendPay),
    total: r3(regularPay + weekendPay),
  };
}

/**
 * GOSI / Social Security (PIFSS) for Kuwaiti nationals
 *   Employee share: 8% of basic + social allowance (capped at 2,750 KWD/month — 2024)
 *   Employer share: 11.5% (employer's expense, not deducted from employee)
 *   Expats: no contribution
 * For simplicity we deduct 8% as a "PIFSS" deduction for Kuwaiti nationals.
 */
function calculatePIFSS({ nationality, basicSalary, socialAllowance = 0 }) {
  if ((nationality || '').toLowerCase() !== 'kuwaiti') return { employee: 0, employer: 0, applicable: false };
  const CAP = 2750;
  const base = Math.min(Number(basicSalary) + Number(socialAllowance || 0), CAP);
  return {
    employee: r3(base * 0.08),
    employer: r3(base * 0.115),
    base,
    applicable: true,
  };
}

module.exports = {
  calculateEndOfService,
  calculateAnnualLeaveBalance,
  calculateSickLeaveBalance,
  calculateOvertime,
  calculatePIFSS,
  daysBetween,
  DAYS_PER_MONTH,
  WORKING_HOURS_PER_DAY,
};
