const { sequelize, Voucher, VoucherLine, GlEntry, Account } = require('../models');
const HttpError = require('../utils/HttpError');

function dec(n) { return Number(n || 0); }

function validateLines(lines) {
  if (!Array.isArray(lines) || lines.length < 2) {
    throw HttpError.badRequest('At least 2 voucher lines are required');
  }
  let totalDebit = 0, totalCredit = 0;
  for (const ln of lines) {
    const d = dec(ln.debit), c = dec(ln.credit);
    if (d < 0 || c < 0) throw HttpError.badRequest('Debit/credit must be non-negative');
    if (d > 0 && c > 0) throw HttpError.badRequest('A line cannot have both debit and credit');
    if (d === 0 && c === 0) throw HttpError.badRequest('Each line must have debit or credit > 0');
    if (!ln.account_id) throw HttpError.badRequest('account_id is required on each line');
    totalDebit += d; totalCredit += c;
  }
  // round to 3 decimals (KWD)
  totalDebit = Math.round(totalDebit * 1000) / 1000;
  totalCredit = Math.round(totalCredit * 1000) / 1000;
  if (totalDebit !== totalCredit) {
    throw HttpError.badRequest(`Voucher is unbalanced: debit=${totalDebit} credit=${totalCredit}`);
  }
  return { totalDebit, totalCredit };
}

async function ensureAccountsPostable(accountIds) {
  const accounts = await Account.findAll({ where: { id: accountIds } });
  if (accounts.length !== accountIds.length) throw HttpError.badRequest('One or more accounts not found');
  for (const acc of accounts) {
    if (acc.is_group) throw HttpError.badRequest(`Cannot post to group account: ${acc.code} ${acc.name}`);
    if (!acc.is_active) throw HttpError.badRequest(`Inactive account: ${acc.code} ${acc.name}`);
  }
}

async function nextVoucherNo(type) {
  const prefix = ({ receipt: 'RV', payment: 'PV', journal: 'JV', contra: 'CV', sales: 'SV', purchase: 'PUR' })[type] || 'VC';
  const year = new Date().getFullYear();
  const [rows] = await sequelize.query(
    `SELECT voucher_no FROM vouchers WHERE voucher_no LIKE :pat ORDER BY id DESC LIMIT 1`,
    { replacements: { pat: `${prefix}-${year}-%` } }
  );
  let seq = 1;
  if (rows.length) {
    const parts = rows[0].voucher_no.split('-');
    const last = parseInt(parts[parts.length - 1], 10);
    if (Number.isFinite(last)) seq = last + 1;
  }
  return `${prefix}-${year}-${String(seq).padStart(5, '0')}`;
}

exports.createVoucher = async (data, userId) => {
  const t = await sequelize.transaction();
  try {
    const lines = data.lines || [];
    const { totalDebit, totalCredit } = validateLines(lines);
    await ensureAccountsPostable(lines.map(l => l.account_id));

    if (!data.branch_id) throw HttpError.badRequest('branch_id is required');

    const voucher_no = data.voucher_no || (await nextVoucherNo(data.voucher_type));
    const v = await Voucher.create({
      voucher_no,
      voucher_type: data.voucher_type,
      voucher_date: data.voucher_date,
      branch_id: data.branch_id,
      fiscal_period_id: data.fiscal_period_id || null,
      currency_id: data.currency_id,
      exchange_rate: data.exchange_rate || 1,
      reference: data.reference || null,
      narration: data.narration || null,
      narration_ar: data.narration_ar || null,
      total_debit: totalDebit,
      total_credit: totalCredit,
      status: 'draft',
      created_by: userId,
    }, { transaction: t });

    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      await VoucherLine.create({
        voucher_id: v.id,
        line_no: i + 1,
        account_id: ln.account_id,
        description: ln.description || null,
        debit: dec(ln.debit),
        credit: dec(ln.credit),
        cost_center: ln.cost_center || null,
        reference: ln.reference || null,
      }, { transaction: t });
    }

    await t.commit();
    return v;
  } catch (err) {
    await t.rollback();
    throw err;
  }
};

exports.postVoucher = async (voucherId, userId) => {
  const t = await sequelize.transaction();
  try {
    const v = await Voucher.findByPk(voucherId, { include: [{ model: VoucherLine, as: 'lines' }], transaction: t });
    if (!v) throw HttpError.notFound('Voucher not found');
    if (v.status === 'posted') throw HttpError.conflict('Voucher already posted');
    if (v.status === 'cancelled') throw HttpError.conflict('Voucher is cancelled');

    // re-validate at post time
    validateLines(v.lines.map(l => ({ debit: l.debit, credit: l.credit, account_id: l.account_id })));
    await ensureAccountsPostable(v.lines.map(l => l.account_id));

    for (const ln of v.lines) {
      await GlEntry.create({
        voucher_id: v.id,
        voucher_line_id: ln.id,
        entry_date: v.voucher_date,
        branch_id: v.branch_id,
        account_id: ln.account_id,
        debit: ln.debit,
        credit: ln.credit,
        currency_id: v.currency_id,
        fiscal_period_id: v.fiscal_period_id,
        narration: ln.description || v.narration,
      }, { transaction: t });
    }
    v.status = 'posted';
    v.posted_at = new Date();
    v.posted_by = userId;
    await v.save({ transaction: t });

    await t.commit();
    return v;
  } catch (err) {
    await t.rollback();
    throw err;
  }
};

exports.cancelVoucher = async (voucherId) => {
  const t = await sequelize.transaction();
  try {
    const v = await Voucher.findByPk(voucherId, { transaction: t });
    if (!v) throw HttpError.notFound('Voucher not found');
    if (v.status === 'cancelled') return v;
    // delete GL entries if posted
    if (v.status === 'posted') {
      await GlEntry.destroy({ where: { voucher_id: v.id }, transaction: t });
    }
    v.status = 'cancelled';
    await v.save({ transaction: t });
    await t.commit();
    return v;
  } catch (err) {
    await t.rollback();
    throw err;
  }
};
