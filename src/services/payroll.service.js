/**
 * Payroll engine.
 * - Calculates per-employee payslip with allowances, overtime, deductions, PIFSS
 * - Persists PayrollRun + Payslip + PayslipLine
 * - When posted, creates a Journal Voucher (Finance) and links it
 */
const {
  sequelize, Branch, Employee, SalaryComponent, EmployeeSalaryComponent,
  PayrollRun, Payslip, PayslipLine, OvertimeEntry, LeaveType, LeaveRequest,
  Account, Currency, Voucher, VoucherLine, GlEntry,
} = require('../models');
const { Op } = require('sequelize');
const HttpError = require('../utils/HttpError');
const kw = require('./kuwaitLabor');

function r3(n) { return Math.round(Number(n || 0) * 1000) / 1000; }

async function nextRunNo(periodYear, periodMonth) {
  const prefix = `PR-${periodYear}-${String(periodMonth).padStart(2, '0')}`;
  const last = await PayrollRun.findOne({ where: { run_no: { [Op.like]: `${prefix}%` } }, order: [['id', 'DESC']] });
  if (!last) return `${prefix}-01`;
  const parts = last.run_no.split('-');
  const seq = parseInt(parts[parts.length - 1], 10) + 1;
  return `${prefix}-${String(seq).padStart(2, '0')}`;
}

async function activeComponentsFor(employeeId, asOf) {
  return await EmployeeSalaryComponent.findAll({
    where: {
      employee_id: employeeId,
      is_active: 1,
      effective_from: { [Op.lte]: asOf },
      [Op.and]: [
        { [Op.or]: [{ effective_to: null }, { effective_to: { [Op.gte]: asOf } }] },
      ],
    },
    include: [{ model: SalaryComponent }],
  });
}

/**
 * Calculate the payslip for one employee for a given period (year/month).
 * Returns the payslip header data + an array of line items.
 */
async function calculatePayslipForEmployee({ employee, periodYear, periodMonth, branchId }) {
  const periodEndDate = new Date(periodYear, periodMonth, 0).toISOString().slice(0, 10);  // last day of month
  const basic = Number(employee.basic_salary || 0);
  const manual = Number(employee.manual_salary || 0);   // الراتب اليدوي — paid as cash-in-hand
  // work_permit_salary is informational only (declared on Iqama), not added to gross

  const lines = [];

  // Built-in basic
  lines.push({ kind: 'basic', label: 'Basic Salary', label_ar: 'الراتب الأساسي', amount: basic });

  // Manual / cash-in-hand portion treated as an allowance line
  if (manual > 0) {
    lines.push({ kind: 'allowance', label: 'Cash-in-hand', label_ar: 'الراتب اليدوي', amount: manual });
  }

  // Built-in allowance fields from the Employee record (housing, transport, other)
  let allowancesTotal = manual;
  if (Number(employee.housing_allowance) > 0) {
    const a = Number(employee.housing_allowance);
    lines.push({ kind: 'allowance', label: 'Housing Allowance', label_ar: 'بدل سكن', amount: a });
    allowancesTotal += a;
  }
  if (Number(employee.transport_allowance) > 0) {
    const a = Number(employee.transport_allowance);
    lines.push({ kind: 'allowance', label: 'Transport Allowance', label_ar: 'بدل مواصلات', amount: a });
    allowancesTotal += a;
  }
  if (Number(employee.other_allowance) > 0) {
    const a = Number(employee.other_allowance);
    lines.push({ kind: 'allowance', label: 'Other Allowance', label_ar: 'بدلات أخرى', amount: a });
    allowancesTotal += a;
  }

  // Custom components (allowances and deductions)
  const components = await activeComponentsFor(employee.id, periodEndDate);
  let deductionsTotal = 0;
  for (const ec of components) {
    const sc = ec.SalaryComponent;
    const amount = ec.amount && Number(ec.amount) > 0
      ? Number(ec.amount)
      : (Number(ec.percent) > 0 ? r3(basic * Number(ec.percent) / 100) : Number(sc.default_amount || 0));
    if (sc.kind === 'allowance') {
      lines.push({ kind: 'allowance', salary_component_id: sc.id, label: sc.name, label_ar: sc.name_ar, amount });
      allowancesTotal += amount;
    } else {
      lines.push({ kind: 'deduction', salary_component_id: sc.id, label: sc.name, label_ar: sc.name_ar, amount });
      deductionsTotal += amount;
    }
  }

  // Approved overtime in this month (not yet paid)
  const otMonthStart = `${periodYear}-${String(periodMonth).padStart(2, '0')}-01`;
  const otRows = await OvertimeEntry.findAll({
    where: {
      employee_id: employee.id,
      status: 'approved',
      entry_date: { [Op.between]: [otMonthStart, periodEndDate] },
    },
  });
  let regularHours = 0, weekendHours = 0;
  otRows.forEach(o => { regularHours += Number(o.regular_hours || 0); weekendHours += Number(o.weekend_hours || 0); });
  const ot = kw.calculateOvertime({ basicSalary: basic, regularHours, weekendHours });
  if (ot.total > 0) {
    if (ot.regular_pay > 0) lines.push({ kind: 'overtime', label: `Overtime ${regularHours}h × 1.25`, label_ar: `وقت إضافي ${regularHours}س × 1.25`, amount: ot.regular_pay });
    if (ot.weekend_pay > 0) lines.push({ kind: 'overtime', label: `Holiday OT ${weekendHours}h × 1.5`, label_ar: `وقت إضافي عطلة ${weekendHours}س × 1.5`, amount: ot.weekend_pay });
  }

  // Unpaid leave deduction (any approved unpaid leave in the month)
  const unpaidType = await LeaveType.findOne({ where: { code: 'unpaid' } });
  let unpaidDays = 0, unpaidAmount = 0;
  if (unpaidType) {
    const unpaidLeaves = await LeaveRequest.findAll({
      where: {
        employee_id: employee.id,
        leave_type_id: unpaidType.id,
        status: 'approved',
        start_date: { [Op.lte]: periodEndDate },
        end_date:   { [Op.gte]: otMonthStart },
      },
    });
    unpaidDays = unpaidLeaves.reduce((s, l) => s + Number(l.days || 0), 0);
    if (unpaidDays > 0) {
      const dailyWage = basic / kw.DAYS_PER_MONTH;
      unpaidAmount = r3(unpaidDays * dailyWage);
      lines.push({ kind: 'deduction', label: `Unpaid leave (${unpaidDays} days)`, label_ar: `إجازة بدون أجر (${unpaidDays} يوم)`, amount: unpaidAmount });
      deductionsTotal += unpaidAmount;
    }
  }

  // PIFSS for Kuwaiti nationals (8% employee share, capped at 2,750 base)
  const pifss = kw.calculatePIFSS({ nationality: employee.nationality, basicSalary: basic, socialAllowance: 0 });
  if (pifss.applicable && pifss.employee > 0) {
    lines.push({ kind: 'pifss', label: 'PIFSS (Social Security 8%)', label_ar: 'التأمينات الاجتماعية 8٪', amount: pifss.employee });
    deductionsTotal += pifss.employee;
  }

  const grossPay = r3(basic + allowancesTotal + ot.total);
  const netPay = r3(grossPay - deductionsTotal);

  return {
    employee_id: employee.id,
    branch_id: branchId,
    period_year: periodYear,
    period_month: periodMonth,
    working_days: kw.DAYS_PER_MONTH,
    paid_days: kw.DAYS_PER_MONTH - unpaidDays,
    basic_salary: basic,
    total_allowances: r3(allowancesTotal),
    total_overtime: r3(ot.total),
    gross_pay: grossPay,
    total_deductions: r3(deductionsTotal),
    pifss_employee: r3(pifss.employee || 0),
    pifss_employer: r3(pifss.employer || 0),
    net_pay: netPay,
    unpaid_leave_days: unpaidDays,
    unpaid_leave_amount: r3(unpaidAmount),
    lines,
  };
}

/**
 * Create a payroll run in DRAFT — calculates all employee payslips and persists them.
 * Does NOT post to GL yet.
 */
exports.createRun = async ({ branchId, periodYear, periodMonth, payDate, notes, userId }) => {
  if (!branchId || !periodYear || !periodMonth) throw HttpError.badRequest('branch_id, period_year, period_month required');

  // Check for existing run on same branch+period
  const existing = await PayrollRun.findOne({ where: { branch_id: branchId, period_year: periodYear, period_month: periodMonth, status: { [Op.ne]: 'cancelled' } } });
  if (existing) throw HttpError.conflict(`Payroll already exists for ${periodYear}-${periodMonth} (status: ${existing.status})`);

  const employees = await Employee.findAll({ where: { status: 'active', branch_id: branchId } });
  if (employees.length === 0) throw HttpError.badRequest('No active employees in this branch');

  const t = await sequelize.transaction();
  try {
    const run = await PayrollRun.create({
      run_no: await nextRunNo(periodYear, periodMonth),
      branch_id: branchId,
      period_year: periodYear,
      period_month: periodMonth,
      pay_date: payDate || new Date().toISOString().slice(0, 10),
      status: 'draft',
      employee_count: employees.length,
      created_by: userId,
      notes: notes || null,
    }, { transaction: t });

    let totalGross = 0, totalDeductions = 0, totalNet = 0;
    for (const emp of employees) {
      const calc = await calculatePayslipForEmployee({ employee: emp, periodYear, periodMonth, branchId });
      const ps = await Payslip.create({ ...calc, payroll_run_id: run.id }, { transaction: t });
      for (const ln of calc.lines) {
        await PayslipLine.create({ ...ln, payslip_id: ps.id }, { transaction: t });
      }
      totalGross += calc.gross_pay;
      totalDeductions += calc.total_deductions;
      totalNet += calc.net_pay;
    }
    run.total_gross = r3(totalGross);
    run.total_deductions = r3(totalDeductions);
    run.total_net = r3(totalNet);
    run.status = 'calculated';
    await run.save({ transaction: t });

    await t.commit();
    return run;
  } catch (e) { await t.rollback(); throw e; }
};

/**
 * Post a payroll run — creates a JV and posts it.
 * JV layout:
 *   Debit  5201 Salaries & Wages — Net + Allowances + OT
 *   Debit  5201 Salaries (or accumulated benefits for PIFSS employer)
 *   Credit 2102 Accrued Salaries — for total net
 *   Credit 2101 Accounts Payable / PIFSS Payable — for PIFSS withholdings (if any)
 */
exports.postRun = async ({ runId, userId }) => {
  const run = await PayrollRun.findByPk(runId, { include: [{ model: Payslip, as: 'payslips', include: [{ model: PayslipLine, as: 'lines' }] }] });
  if (!run) throw HttpError.notFound('Payroll run not found');
  if (run.status === 'posted') throw HttpError.conflict('Already posted');
  if (run.status === 'cancelled') throw HttpError.conflict('Cancelled run cannot be posted');

  // Resolve key accounts by code (created in seed)
  const accSalary  = await Account.findOne({ where: { code: '5201' } });          // Salaries & Wages
  const accAccSal  = await Account.findOne({ where: { code: '2102' } });          // Accrued Salaries
  if (!accSalary || !accAccSal) throw HttpError.badRequest('Required GL accounts not found (5201 / 2102)');

  // PIFSS payable account — fall back to AP if not present
  let accPifss = await Account.findOne({ where: { code: '2104' } });
  if (!accPifss) accPifss = await Account.findOne({ where: { code: '2101' } });    // AP fallback

  const baseCurrency = await Currency.findOne({ where: { is_base: 1 } });
  if (!baseCurrency) throw HttpError.badRequest('Base currency not found');

  // Aggregate amounts
  const totalGross = Number(run.total_gross);
  const totalPifssEmp = run.payslips.reduce((s, p) => s + Number(p.pifss_employee || 0), 0);
  const totalNet = Number(run.total_net);

  // Lines:
  // Dr Salaries & Wages   = totalGross (expense)
  // Cr Accrued Salaries   = totalNet
  // Cr PIFSS payable      = totalPifssEmp
  // Other deductions (e.g. unpaid leave reduces gross, advances, loans)
  // To keep balance: Dr 5201 must equal Cr (Accrued + PIFSS + OtherDeductions)
  // For simplicity here we record:
  //   Dr 5201 totalGross
  //   Cr 2102 (totalGross - totalPifssEmp)   (= net + non-PIFSS deductions)
  //   Cr Pifss payable totalPifssEmp
  // This assumes other deductions (advances/loans) sit in accrued salaries until disbursed (common practice).

  const lines = [
    { account_id: accSalary.id, debit: r3(totalGross), credit: 0, description: `Payroll ${run.run_no}` },
    { account_id: accAccSal.id, debit: 0, credit: r3(totalGross - totalPifssEmp), description: `Net + non-PIFSS — ${run.run_no}` },
  ];
  if (totalPifssEmp > 0) {
    lines.push({ account_id: accPifss.id, debit: 0, credit: r3(totalPifssEmp), description: `PIFSS withholding — ${run.run_no}` });
  }

  const sumD = lines.reduce((s, l) => s + l.debit, 0);
  const sumC = lines.reduce((s, l) => s + l.credit, 0);
  if (r3(sumD) !== r3(sumC)) {
    throw HttpError.badRequest(`Payroll JV unbalanced: Dr ${sumD} vs Cr ${sumC}`);
  }

  // Create voucher via direct insert (the voucher service requires lines too)
  const t = await sequelize.transaction();
  try {
    const voucher = await Voucher.create({
      voucher_no: `JV-${run.period_year}-PR${String(run.period_month).padStart(2,'0')}-${String(run.id).padStart(4,'0')}`,
      voucher_type: 'journal',
      voucher_date: run.pay_date,
      branch_id: run.branch_id,
      currency_id: baseCurrency.id,
      exchange_rate: 1,
      reference: run.run_no,
      narration: `Payroll for ${run.period_year}-${String(run.period_month).padStart(2,'0')}`,
      narration_ar: `رواتب شهر ${run.period_year}-${String(run.period_month).padStart(2,'0')}`,
      total_debit: r3(sumD),
      total_credit: r3(sumC),
      status: 'posted',
      posted_at: new Date(),
      posted_by: userId,
      created_by: userId,
    }, { transaction: t });

    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      const vl = await VoucherLine.create({
        voucher_id: voucher.id, line_no: i + 1,
        account_id: ln.account_id, description: ln.description,
        debit: ln.debit, credit: ln.credit,
      }, { transaction: t });
      await GlEntry.create({
        voucher_id: voucher.id, voucher_line_id: vl.id,
        entry_date: voucher.voucher_date, branch_id: voucher.branch_id,
        account_id: ln.account_id, debit: ln.debit, credit: ln.credit,
        currency_id: voucher.currency_id, narration: ln.description,
      }, { transaction: t });
    }

    run.voucher_id = voucher.id;
    run.status = 'posted';
    run.posted_at = new Date();
    run.posted_by = userId;
    await run.save({ transaction: t });

    await t.commit();
    return { run, voucher_id: voucher.id, voucher_no: voucher.voucher_no };
  } catch (e) { await t.rollback(); throw e; }
};

exports.cancelRun = async ({ runId }) => {
  const t = await sequelize.transaction();
  try {
    const run = await PayrollRun.findByPk(runId, { transaction: t });
    if (!run) throw HttpError.notFound('Payroll run not found');
    if (run.status === 'cancelled') return run;

    // Reverse GL entries if posted
    if (run.status === 'posted' && run.voucher_id) {
      await GlEntry.destroy({ where: { voucher_id: run.voucher_id }, transaction: t });
      const v = await Voucher.findByPk(run.voucher_id, { transaction: t });
      if (v) { v.status = 'cancelled'; await v.save({ transaction: t }); }
    }
    run.status = 'cancelled';
    await run.save({ transaction: t });
    await t.commit();
    return run;
  } catch (e) { await t.rollback(); throw e; }
};

exports.calculatePayslipForEmployee = calculatePayslipForEmployee;
