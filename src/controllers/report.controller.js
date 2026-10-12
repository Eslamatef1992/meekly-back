const { sequelize } = require('../models');

function applyBranchFilter(conds, repl, req, alias = 'g') {
  if (req.query.branch_id) {
    conds.push(`(${alias}.branch_id = :branch_id OR ${alias}.branch_id IS NULL)`);
    repl.branch_id = Number(req.query.branch_id);
  }
}

/**
 * Trial Balance
 * Returns one row per posting (leaf) account with debit/credit totals in date range
 * and computed closing balance respecting normal_balance side.
 * Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD&branch_id=1
 */
exports.trialBalance = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const conds = ['a.is_group = 0'];
    const repl = {};
    if (from) { conds.push('(g.entry_date IS NULL OR g.entry_date >= :from)'); repl.from = from; }
    if (to)   { conds.push('(g.entry_date IS NULL OR g.entry_date <= :to)');   repl.to = to; }
    applyBranchFilter(conds, repl, req);
    const [rows] = await sequelize.query(
      `SELECT a.id, a.code, a.name, a.name_ar, a.account_type, a.normal_balance,
              COALESCE(SUM(g.debit),0)  AS debit_sum,
              COALESCE(SUM(g.credit),0) AS credit_sum
       FROM accounts a
       LEFT JOIN gl_entries g ON g.account_id = a.id
       WHERE ${conds.join(' AND ')}
       GROUP BY a.id, a.code, a.name, a.name_ar, a.account_type, a.normal_balance
       ORDER BY a.code`,
      { replacements: repl }
    );
    const data = rows.map(r => {
      const d = Number(r.debit_sum), c = Number(r.credit_sum);
      const net = d - c;
      let debit_balance = 0, credit_balance = 0;
      if (r.normal_balance === 'debit') {
        if (net >= 0) debit_balance = net; else credit_balance = -net;
      } else {
        if (net <= 0) credit_balance = -net; else debit_balance = net;
      }
      return {
        id: r.id, code: r.code, name: r.name, name_ar: r.name_ar,
        account_type: r.account_type, normal_balance: r.normal_balance,
        debit_sum: d, credit_sum: c,
        debit_balance, credit_balance,
      };
    });
    const totals = data.reduce((acc, r) => ({
      debit_sum: acc.debit_sum + r.debit_sum,
      credit_sum: acc.credit_sum + r.credit_sum,
      debit_balance: acc.debit_balance + r.debit_balance,
      credit_balance: acc.credit_balance + r.credit_balance,
    }), { debit_sum: 0, credit_sum: 0, debit_balance: 0, credit_balance: 0 });
    res.json({ from: from || null, to: to || null, branch_id: req.query.branch_id || null, rows: data, totals });
  } catch (e) { next(e); }
};

/** General Ledger for a single account in date range */
exports.generalLedger = async (req, res, next) => {
  try {
    const { account_id, from, to, branch_id } = req.query;
    if (!account_id) return res.status(400).json({ error: 'BAD_REQUEST', message: 'account_id required' });
    const conds = ['g.account_id = :acc'];
    const repl = { acc: Number(account_id) };
    if (from) { conds.push('g.entry_date >= :from'); repl.from = from; }
    if (to)   { conds.push('g.entry_date <= :to');   repl.to = to; }
    if (branch_id) { conds.push('g.branch_id = :branch_id'); repl.branch_id = Number(branch_id); }

    // opening balance (before from-date)
    let opening = 0;
    if (from) {
      const openConds = ['account_id = :acc', 'entry_date < :from'];
      const openRepl = { acc: Number(account_id), from };
      if (branch_id) { openConds.push('branch_id = :branch_id'); openRepl.branch_id = Number(branch_id); }
      const [o] = await sequelize.query(
        `SELECT COALESCE(SUM(debit),0) - COALESCE(SUM(credit),0) AS opening
         FROM gl_entries WHERE ${openConds.join(' AND ')}`,
        { replacements: openRepl }
      );
      opening = Number(o[0].opening);
    }
    const [rows] = await sequelize.query(
      `SELECT g.id, g.entry_date, g.debit, g.credit, g.narration, g.branch_id,
              v.voucher_no, v.voucher_type
       FROM gl_entries g
       JOIN vouchers v ON v.id = g.voucher_id
       WHERE ${conds.join(' AND ')}
       ORDER BY g.entry_date, g.id`,
      { replacements: repl }
    );
    let running = opening;
    const data = rows.map(r => {
      running += Number(r.debit) - Number(r.credit);
      return { ...r, running_balance: running };
    });
    res.json({ account_id: Number(account_id), opening, rows: data, closing: running });
  } catch (e) { next(e); }
};

/** Income Statement (P&L) — sums income & expenses */
exports.incomeStatement = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const conds = ["a.account_type IN ('income','expense')", 'a.is_group = 0'];
    const repl = {};
    if (from) { conds.push('(g.entry_date IS NULL OR g.entry_date >= :from)'); repl.from = from; }
    if (to)   { conds.push('(g.entry_date IS NULL OR g.entry_date <= :to)');   repl.to = to; }
    applyBranchFilter(conds, repl, req);
    const [rows] = await sequelize.query(
      `SELECT a.id, a.code, a.name, a.name_ar, a.account_type, a.account_subtype,
              COALESCE(SUM(g.debit),0) AS debit_sum,
              COALESCE(SUM(g.credit),0) AS credit_sum
       FROM accounts a
       LEFT JOIN gl_entries g ON g.account_id = a.id
       WHERE ${conds.join(' AND ')}
       GROUP BY a.id, a.code, a.name, a.name_ar, a.account_type, a.account_subtype
       ORDER BY a.code`,
      { replacements: repl }
    );
    const income = [], expense = [];
    let totalIncome = 0, totalExpense = 0;
    for (const r of rows) {
      const amt = r.account_type === 'income'
        ? Number(r.credit_sum) - Number(r.debit_sum)   // income increases with credit
        : Number(r.debit_sum)  - Number(r.credit_sum); // expense increases with debit
      const row = { id: r.id, code: r.code, name: r.name, name_ar: r.name_ar, subtype: r.account_subtype, amount: amt };
      if (r.account_type === 'income') { income.push(row); totalIncome += amt; }
      else { expense.push(row); totalExpense += amt; }
    }
    res.json({
      from, to, branch_id: req.query.branch_id || null,
      income, expense, totalIncome, totalExpense,
      netIncome: Number((totalIncome - totalExpense).toFixed(3)),
    });
  } catch (e) { next(e); }
};

/** Balance Sheet (as-of date) */
exports.balanceSheet = async (req, res, next) => {
  try {
    const { as_of } = req.query;
    const conds = ["a.account_type IN ('asset','liability','equity')", 'a.is_group = 0'];
    const repl = {};
    if (as_of) { conds.push('(g.entry_date IS NULL OR g.entry_date <= :as_of)'); repl.as_of = as_of; }
    applyBranchFilter(conds, repl, req);
    const [rows] = await sequelize.query(
      `SELECT a.id, a.code, a.name, a.name_ar, a.account_type, a.account_subtype, a.normal_balance,
              COALESCE(SUM(g.debit),0)  AS debit_sum,
              COALESCE(SUM(g.credit),0) AS credit_sum
       FROM accounts a
       LEFT JOIN gl_entries g ON g.account_id = a.id
       WHERE ${conds.join(' AND ')}
       GROUP BY a.id, a.code, a.name, a.name_ar, a.account_type, a.account_subtype, a.normal_balance
       ORDER BY a.code`,
      { replacements: repl }
    );

    // Also fold net income (retained earnings movement) into equity for the as_of date
    let netIncomeFolded = 0;
    {
      const pConds = ["a.account_type IN ('income','expense')", 'a.is_group = 0'];
      const pRepl = {};
      if (as_of) { pConds.push('(g.entry_date IS NULL OR g.entry_date <= :as_of)'); pRepl.as_of = as_of; }
      if (req.query.branch_id) { pConds.push('(g.branch_id = :branch_id OR g.branch_id IS NULL)'); pRepl.branch_id = Number(req.query.branch_id); }
      const [pl] = await sequelize.query(
        `SELECT a.account_type,
                COALESCE(SUM(g.debit),0)  AS debit_sum,
                COALESCE(SUM(g.credit),0) AS credit_sum
         FROM accounts a
         LEFT JOIN gl_entries g ON g.account_id = a.id
         WHERE ${pConds.join(' AND ')}
         GROUP BY a.account_type`,
        { replacements: pRepl }
      );
      let income = 0, expense = 0;
      for (const r of pl) {
        if (r.account_type === 'income') income = Number(r.credit_sum) - Number(r.debit_sum);
        if (r.account_type === 'expense') expense = Number(r.debit_sum) - Number(r.credit_sum);
      }
      netIncomeFolded = Number((income - expense).toFixed(3));
    }

    const buckets = { asset: [], liability: [], equity: [] };
    const totals  = { asset: 0,  liability: 0,  equity: 0 };
    for (const r of rows) {
      const amt = r.normal_balance === 'debit'
        ? Number(r.debit_sum)  - Number(r.credit_sum)
        : Number(r.credit_sum) - Number(r.debit_sum);
      buckets[r.account_type].push({ id: r.id, code: r.code, name: r.name, name_ar: r.name_ar, subtype: r.account_subtype, amount: amt });
      totals[r.account_type] += amt;
    }
    // include retained net income line in equity
    buckets.equity.push({ id: 0, code: 'NI', name: 'Current period net income', name_ar: 'صافي ربح الفترة الحالية', subtype: 'retained_earnings', amount: netIncomeFolded });
    totals.equity += netIncomeFolded;

    res.json({
      as_of, branch_id: req.query.branch_id || null,
      ...buckets,
      totals,
      check: Number((totals.asset - (totals.liability + totals.equity)).toFixed(3)),
    });
  } catch (e) { next(e); }
};
