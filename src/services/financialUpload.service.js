// =====================================================================
// Financial Upload service — parses Excel files and imports them into
// accounts / vouchers for a chosen fiscal period. Mirrors the parsing
// logic we used for the FY2020 import (fixed-column layout we figured
// out empirically from Mekky's source Excel).
//
// Jobs are processed one at a time in a tiny in-process queue so the
// HTTP request can return immediately with a job id.
// =====================================================================
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const {
  sequelize, FinancialUploadJob, FiscalPeriod,
  Account, Voucher, VoucherLine, GlEntry, Currency, Branch,
} = require('../models');

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
const toNumber = v => {
  if (v == null || v === '') return 0;
  const n = Number(String(v).replace(/[,\s]+/g, '').replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const toStr = v => (v == null ? '' : String(v)).trim();

// Guess account_type / normal_balance from the top-level account code.
// Matches the Kuwaiti chart convention: 1 asset, 2 liability, 3 equity, 4 income, 5 expense.
function classifyAccount(code) {
  const c = String(code || '').trim();
  const first = c.charAt(0);
  switch (first) {
    case '1': return { account_type: 'asset',     normal_balance: 'debit'  };
    case '2': return { account_type: 'liability', normal_balance: 'credit' };
    case '3': return { account_type: 'equity',    normal_balance: 'credit' };
    case '4': return { account_type: 'income',    normal_balance: 'credit' };
    case '5': return { account_type: 'expense',   normal_balance: 'debit'  };
    default:  return { account_type: 'asset',     normal_balance: 'debit'  };
  }
}

// Convert Excel serial date OR ISO-ish string to YYYY-MM-DD
function parseExcelDate(v) {
  if (!v) return null;
  if (typeof v === 'number') {
    // Excel epoch: 1899-12-30
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    if (!isNaN(d)) return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  // d/m/yyyy or d-m-yyyy
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const day = m[1].padStart(2, '0');
    const mon = m[2].padStart(2, '0');
    let year = m[3];
    if (year.length === 2) year = '20' + year;
    return `${year}-${mon}-${day}`;
  }
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------
// Parser: chart of accounts
// Accepts flexible column headers (code, name, name_ar, parent, type, ...)
// ---------------------------------------------------------------------
async function importChartOfAccounts(job, filepath) {
  const wb = XLSX.readFile(filepath, { cellDates: false, raw: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', header: 1 });
  if (!rows.length) throw new Error('Sheet is empty');

  // Autodetect header row — the row with the most non-numeric strings in the first 10 cells
  let headerRow = 0;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const firstFew = rows[i].slice(0, 6).map(toStr).filter(Boolean);
    if (firstFew.length >= 3 && firstFew.every(c => isNaN(Number(c)))) {
      headerRow = i; break;
    }
  }
  const header = rows[headerRow].map(h => toStr(h).toLowerCase());
  const col = (names) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const idxCode   = col(['code', 'account code', 'الرقم', 'رقم الحساب']);
  const idxName   = col(['name', 'account name', 'name (english)', 'english name']);
  const idxNameAr = col(['name_ar', 'name ar', 'اسم', 'اسم الحساب', 'name (arabic)', 'arabic name']);
  const idxParent = col(['parent', 'parent code', 'parent_code', 'الأصل']);
  const idxType   = col(['type', 'account type', 'نوع']);

  const data = rows.slice(headerRow + 1);
  let inserted = 0, skipped = 0, failed = 0;
  const errors = [];

  await sequelize.transaction(async (tx) => {
    for (const row of data) {
      const code = toStr(row[idxCode]);
      if (!code) { skipped++; continue; }
      const name = toStr(row[idxName]) || toStr(row[idxNameAr]) || code;
      const nameAr = idxNameAr >= 0 ? toStr(row[idxNameAr]) : null;

      // skip if exists
      const existing = await Account.findOne({ where: { code }, transaction: tx });
      if (existing) { skipped++; continue; }

      let parent_id = null;
      if (idxParent >= 0) {
        const parentCode = toStr(row[idxParent]);
        if (parentCode) {
          const parent = await Account.findOne({ where: { code: parentCode }, transaction: tx });
          if (parent) parent_id = parent.id;
        }
      }

      const { account_type, normal_balance } = classifyAccount(code);

      try {
        await Account.create({
          code, name, name_ar: nameAr,
          parent_id, account_type, normal_balance,
          is_group: 0, is_active: 1,
          level: Math.min(code.length, 8),
          imported_by_job_id: job.id,
        }, { transaction: tx });
        inserted++;
      } catch (e) {
        failed++;
        if (errors.length < 50) errors.push(`code=${code}: ${e.message}`);
      }
    }
  });

  return {
    inserted_rows: inserted,
    skipped_rows: skipped,
    failed_rows: failed,
    total_debit: 0, total_credit: 0,
    error_message: errors.length ? errors.join('\n') : null,
  };
}

// ---------------------------------------------------------------------
// Parser: vouchers
// Uses the fixed-column layout observed in Mekky's سندات 2020.xls:
//   col 3  = credit   (as "- 123.456")
//   col 6  = debit    (as "+ 123.456" or bare number)
//   col 11 = narration (Arabic)
//   col 13 = voucher number (int)
//   col 19 = account name (fallback label)
//   col 25 = account code
//   col 28 = voucher_date (d/m/yyyy)
//   col 30 = voucher type label (قيد / قبض / دفع / بيع / شراء)
// First few rows are headers/subtotals, so we only process rows where a
// numeric account code is present AND either debit or credit is non-zero.
// Vouchers are grouped by the "voucher number" column within each type.
// ---------------------------------------------------------------------
async function importVouchers(job, filepath, options) {
  const period = await FiscalPeriod.findByPk(job.fiscal_period_id);
  if (!period) throw new Error(`Fiscal period ${job.fiscal_period_id} not found`);
  const periodPrefix = period.code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

  const defaultBranch = options.branch_id
    ? await Branch.findByPk(options.branch_id)
    : await Branch.findOne({ order: [['id', 'ASC']] });
  if (!defaultBranch) throw new Error('No branches configured; cannot assign vouchers');

  const defaultCurrency = await Currency.findOne({ where: { code: 'KWD' } })
    || await Currency.findOne({ order: [['id', 'ASC']] });

  const wb = XLSX.readFile(filepath, { cellDates: false, raw: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', header: 1 });

  // Account cache: code -> id
  const accountCache = new Map();
  const getAccountId = async (code, tx) => {
    const key = String(code);
    if (accountCache.has(key)) return accountCache.get(key);
    const acc = await Account.findOne({ where: { code: key }, transaction: tx });
    accountCache.set(key, acc ? acc.id : null);
    return acc ? acc.id : null;
  };

  // Map Arabic voucher-type label -> enum
  const typeMap = {
    'قيد': 'journal', 'سند قيد': 'journal', 'journal': 'journal',
    'قبض': 'receipt', 'سند قبض': 'receipt', 'receipt': 'receipt',
    'دفع': 'payment', 'سند دفع': 'payment', 'payment': 'payment',
    'بيع':  'sales',  'sales':  'sales',
    'شراء': 'purchase','purchase':'purchase',
  };

  // --- Pass 1: scan rows, group lines by (type + voucher_no) ---
  const groups = new Map(); // key -> { type, src_vno, date, narration, lines[] }
  for (const row of rows) {
    const code = toStr(row[25]);
    if (!code || !/^\d+$/.test(code)) continue;
    const debit  = toNumber(row[6]);
    const credit = toNumber(row[3]);
    if (debit === 0 && credit === 0) continue;

    const src_vno = toStr(row[13]) || '0';
    const date    = parseExcelDate(row[28]) || period.start_date;
    const typeLbl = toStr(row[30]).trim();
    const type    = typeMap[typeLbl] || typeMap[typeLbl.toLowerCase()] || 'journal';
    const narration_ar = toStr(row[11]);
    const name    = toStr(row[19]);

    const key = `${type}::${src_vno}`;
    if (!groups.has(key)) {
      groups.set(key, {
        type, src_vno, date, narration_ar, lines: [],
      });
    }
    groups.get(key).lines.push({ code, name, debit, credit });
  }

  if (groups.size === 0) throw new Error('No voucher rows detected — check the Excel layout');

  // --- Pass 2: insert vouchers ---
  let inserted = 0, failed = 0;
  let totalDebit = 0, totalCredit = 0;
  const errors = [];
  let seq = 0;

  // Find the next sequence number for this period so re-runs continue numbering.
  const existing = await Voucher.count({
    where: { fiscal_period_id: job.fiscal_period_id, voucher_no: { [require('sequelize').Op.like]: `${periodPrefix}-JV-%` } },
  });
  seq = existing;

  for (const g of groups.values()) {
    const tx = await sequelize.transaction();
    try {
      seq += 1;
      const voucher_no = `${periodPrefix}-JV-${String(seq).padStart(5, '0')}`;
      const sumDebit  = g.lines.reduce((a, l) => a + l.debit,  0);
      const sumCredit = g.lines.reduce((a, l) => a + l.credit, 0);

      const v = await Voucher.create({
        voucher_no,
        voucher_type: g.type,
        voucher_date: g.date,
        branch_id: defaultBranch.id,
        fiscal_period_id: job.fiscal_period_id,
        currency_id: defaultCurrency.id,
        exchange_rate: 1,
        reference: `#${g.src_vno}`,
        narration: g.narration_ar,
        narration_ar: g.narration_ar,
        total_debit: sumDebit.toFixed(3),
        total_credit: sumCredit.toFixed(3),
        status: 'posted',
        posted_at: new Date(),
        posted_by: job.uploaded_by,
        created_by: job.uploaded_by,
        imported_by_job_id: job.id,
      }, { transaction: tx });

      // Lines + GL entries
      for (const line of g.lines) {
        const accId = await getAccountId(line.code, tx);
        if (!accId) {
          // unknown account — skip line but keep voucher (won't balance; fail the voucher instead)
          throw new Error(`Unknown account code "${line.code}" for voucher #${g.src_vno}`);
        }
        const vl = await VoucherLine.create({
          voucher_id: v.id,
          account_id: accId,
          debit: line.debit.toFixed(3),
          credit: line.credit.toFixed(3),
          description: line.name || g.narration_ar,
        }, { transaction: tx });
        await GlEntry.create({
          voucher_id: v.id,
          voucher_line_id: vl.id,
          account_id: accId,
          branch_id: defaultBranch.id,
          entry_date: g.date,
          debit: line.debit.toFixed(3),
          credit: line.credit.toFixed(3),
        }, { transaction: tx });
      }

      await tx.commit();
      inserted++;
      totalDebit += sumDebit;
      totalCredit += sumCredit;
    } catch (e) {
      await tx.rollback();
      failed++;
      if (errors.length < 50) errors.push(`voucher #${g.src_vno}: ${e.message}`);
    }
  }

  return {
    inserted_rows: inserted,
    skipped_rows: 0,
    failed_rows: failed,
    total_debit: totalDebit.toFixed(3),
    total_credit: totalCredit.toFixed(3),
    error_message: errors.length ? errors.join('\n') : null,
  };
}

// ---------------------------------------------------------------------
// Job runner (in-process queue — one job at a time)
// ---------------------------------------------------------------------
let running = false;
const queue = [];

function enqueue(jobId) {
  queue.push(jobId);
  tick();
}

async function tick() {
  if (running) return;
  const next = queue.shift();
  if (!next) return;
  running = true;
  try {
    await runJob(next);
  } catch (e) {
    console.error('[financialUpload] runJob crashed:', e);
  } finally {
    running = false;
    if (queue.length) setImmediate(tick);
  }
}

async function runJob(jobId) {
  const job = await FinancialUploadJob.findByPk(jobId);
  if (!job) return;
  await job.update({ status: 'processing', started_at: new Date() });

  const filepath = path.join(
    process.env.FIN_UPLOADS_DIR || path.resolve(__dirname, '../../uploads/financial'),
    job.stored_filename,
  );

  try {
    if (!fs.existsSync(filepath)) throw new Error('Uploaded file not found on disk');
    const opts = job.options_json ? JSON.parse(job.options_json) : {};
    const result = job.upload_type === 'chart_of_accounts'
      ? await importChartOfAccounts(job, filepath)
      : await importVouchers(job, filepath, opts);

    await job.update({
      status: result.failed_rows > 0 && result.inserted_rows === 0 ? 'failed' : 'completed',
      inserted_rows: result.inserted_rows,
      skipped_rows:  result.skipped_rows,
      failed_rows:   result.failed_rows,
      total_debit:   result.total_debit,
      total_credit:  result.total_credit,
      error_message: result.error_message,
      finished_at:   new Date(),
    });
  } catch (e) {
    console.error('[financialUpload] job', jobId, 'failed:', e);
    await job.update({
      status: 'failed',
      error_message: e.message + '\n' + (e.stack || ''),
      finished_at: new Date(),
    });
  }
}

// Rollback = delete every row tagged with this job id, then mark job rolled_back.
async function rollbackJob(jobId) {
  const job = await FinancialUploadJob.findByPk(jobId);
  if (!job) throw new Error('Job not found');
  if (!['completed', 'failed'].includes(job.status)) {
    throw new Error(`Cannot rollback a job in status: ${job.status}`);
  }
  await sequelize.transaction(async (tx) => {
    if (job.upload_type === 'vouchers') {
      await GlEntry.destroy({
        where: { voucher_id: { [require('sequelize').Op.in]:
          sequelize.literal(`(SELECT id FROM vouchers WHERE imported_by_job_id = ${job.id})`) } },
        transaction: tx,
      });
      await VoucherLine.destroy({
        where: { voucher_id: { [require('sequelize').Op.in]:
          sequelize.literal(`(SELECT id FROM vouchers WHERE imported_by_job_id = ${job.id})`) } },
        transaction: tx,
      });
      await Voucher.destroy({ where: { imported_by_job_id: job.id }, transaction: tx });
    } else if (job.upload_type === 'chart_of_accounts') {
      await Account.destroy({ where: { imported_by_job_id: job.id }, transaction: tx });
    }
    await job.update({ status: 'rolled_back', finished_at: new Date() }, { transaction: tx });
  });
  return job;
}

module.exports = { enqueue, rollbackJob };
