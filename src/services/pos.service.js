/**
 * POS Service — places sales, manages shifts, posts to Finance + Inventory.
 *
 * Sale JV (per sale, posted immediately):
 *   For each payment line:
 *     Dr Payment account (Cash 1101 / Bank for KNET / Card clearing / AR for on-account)
 *   Cr Sales Revenue 4101 (total sale amount)
 *   Dr COGS 5101 (sum of qty × avg_cost)
 *   Cr Inventory 1120 (same as COGS)
 */
const { Op } = require('sequelize');
const {
  sequelize, Register, Shift, POSSale, POSSaleLine, POSPayment,
  Item, StockBalance, StockMovement, Product,
  Account, Currency, Voucher, VoucherLine, GlEntry,
  Customer,
} = require('../models');
const HttpError = require('../utils/HttpError');

function r3(n) { return Math.round(Number(n || 0) * 1000) / 1000; }

async function nextSaleNo(branchCode = 'MK') {
  const today = new Date();
  const yyyymmdd = today.getFullYear() + String(today.getMonth() + 1).padStart(2, '0') + String(today.getDate()).padStart(2, '0');
  const prefix = `POS-${branchCode}-${yyyymmdd}`;
  const last = await POSSale.findOne({ where: { sale_no: { [Op.like]: `${prefix}-%` } }, order: [['id', 'DESC']] });
  let seq = 1;
  if (last) {
    const parts = last.sale_no.split('-');
    const n = parseInt(parts[parts.length - 1], 10);
    if (Number.isFinite(n)) seq = n + 1;
  }
  return `${prefix}-${String(seq).padStart(4, '0')}`;
}

async function nextShiftNo() {
  const today = new Date();
  const yyyymmdd = today.getFullYear() + String(today.getMonth() + 1).padStart(2, '0') + String(today.getDate()).padStart(2, '0');
  const prefix = `SH-${yyyymmdd}`;
  const last = await Shift.findOne({ where: { shift_no: { [Op.like]: `${prefix}-%` } }, order: [['id', 'DESC']] });
  let seq = 1;
  if (last) {
    const parts = last.shift_no.split('-');
    const n = parseInt(parts[parts.length - 1], 10);
    if (Number.isFinite(n)) seq = n + 1;
  }
  return `${prefix}-${String(seq).padStart(3, '0')}`;
}

// Account resolvers — by code, with caching per call
async function resolveAccounts() {
  const codes = ['1101', '1102', '1110', '1120', '4101', '5101'];
  const accounts = await Account.findAll({ where: { code: { [Op.in]: codes } } });
  const byCode = {};
  accounts.forEach(a => { byCode[a.code] = a; });
  const missing = codes.filter(c => !byCode[c]);
  if (missing.length) throw HttpError.badRequest(`Missing GL accounts for POS: ${missing.join(', ')}`);
  return byCode;
}

function paymentToAccountCode(method) {
  switch (method) {
    case 'cash':       return '1101';   // Cash on Hand
    case 'knet':       return '1102';   // Bank — NBK (KNET typically settles to bank)
    case 'card':       return '1102';   // Bank — credit card settlement
    case 'on_account': return '1110';   // Accounts Receivable
    case 'voucher':    return '1101';
    case 'other':      return '1101';
    default:           return '1101';
  }
}

exports.openShift = async ({ registerId, openingCash, userId }) => {
  const reg = await Register.findByPk(registerId);
  if (!reg) throw HttpError.notFound('Register not found');
  if (!reg.is_active) throw HttpError.badRequest('Register is inactive');

  const existing = await Shift.findOne({ where: { register_id: registerId, status: 'open' } });
  if (existing) throw HttpError.conflict('Register already has an open shift');

  const shift = await Shift.create({
    shift_no: await nextShiftNo(),
    register_id: registerId,
    branch_id: reg.branch_id,
    cashier_id: userId,
    opened_at: new Date(),
    opening_cash: r3(openingCash),
    status: 'open',
  });
  return shift;
};

exports.closeShift = async ({ shiftId, countedCash, notes, userId }) => {
  const shift = await Shift.findByPk(shiftId);
  if (!shift) throw HttpError.notFound('Shift not found');
  if (shift.status !== 'open') throw HttpError.conflict('Shift is not open');

  const sales = await POSSale.findAll({ where: { shift_id: shift.id, status: 'completed' }, include: [{ model: POSPayment, as: 'payments' }] });

  const totals = { cash: 0, knet: 0, card: 0, on_account: 0, voucher: 0, other: 0 };
  let saleTotal = 0;
  for (const s of sales) {
    saleTotal += Number(s.total);
    for (const p of s.payments) totals[p.method] = (totals[p.method] || 0) + Number(p.amount);
  }

  const expectedCash = r3(Number(shift.opening_cash) + (totals.cash || 0));
  const variance = r3(Number(countedCash || 0) - expectedCash);

  shift.closed_at = new Date();
  shift.total_sales = r3(saleTotal);
  shift.sale_count = sales.length;
  shift.expected_cash = expectedCash;
  shift.counted_cash = r3(countedCash || 0);
  shift.variance = variance;
  shift.payment_breakdown_json = totals;
  shift.notes = notes || null;
  shift.status = 'closed';
  await shift.save();
  return shift;
};

exports.xReport = async ({ shiftId }) => {
  const shift = await Shift.findByPk(shiftId, { include: [{ model: POSSale, as: 'sales', include: [{ model: POSPayment, as: 'payments' }] }] });
  if (!shift) throw HttpError.notFound('Shift not found');
  const totals = { cash: 0, knet: 0, card: 0, on_account: 0, voucher: 0, other: 0 };
  let saleTotal = 0, saleCount = 0;
  for (const s of shift.sales || []) {
    if (s.status !== 'completed') continue;
    saleCount += 1;
    saleTotal += Number(s.total);
    for (const p of s.payments) totals[p.method] = (totals[p.method] || 0) + Number(p.amount);
  }
  return {
    shift_id: shift.id, shift_no: shift.shift_no,
    register_id: shift.register_id, branch_id: shift.branch_id,
    opened_at: shift.opened_at, opening_cash: shift.opening_cash,
    sale_count: saleCount, total_sales: r3(saleTotal),
    payment_breakdown: totals,
    expected_cash: r3(Number(shift.opening_cash) + (totals.cash || 0)),
    status: shift.status,
  };
};

/**
 * Place a sale at the POS:
 *   - validates shift is open
 *   - validates each item has enough stock (blocking out-of-stock)
 *   - captures unit cost from StockBalance for COGS
 *   - creates sale + lines + payments
 *   - decrements StockBalance + creates stock_movement (out)
 *   - posts a Journal Voucher to Finance
 */
exports.placeSale = async ({ shiftId, customerId, lines, payments, discount = 0, notes, userId }) => {
  if (!Array.isArray(lines) || !lines.length) throw HttpError.badRequest('No items in basket');
  if (!Array.isArray(payments) || !payments.length) throw HttpError.badRequest('No payment provided');

  const shift = await Shift.findByPk(shiftId, { include: [{ model: Register }] });
  if (!shift) throw HttpError.notFound('Shift not found');
  if (shift.status !== 'open') throw HttpError.conflict('Shift is not open');

  const register = shift.Register;
  if (!register) throw HttpError.badRequest('Register missing');
  if (!register.warehouse_id) throw HttpError.badRequest('Register is not assigned to a warehouse');

  const accounts = await resolveAccounts();
  const baseCurrency = await Currency.findOne({ where: { is_base: 1 } });

  const t = await sequelize.transaction();
  try {
    // Calculate totals + capture unit costs (and validate stock)
    let subtotal = 0;
    let totalCost = 0;
    const richLines = [];
    let lineNo = 0;

    for (const ln of lines) {
      lineNo += 1;
      const qty = Number(ln.quantity || 0);
      if (qty <= 0) throw HttpError.badRequest(`Line ${lineNo}: quantity must be > 0`);

      const itemId = ln.item_id;
      if (!itemId) throw HttpError.badRequest(`Line ${lineNo}: item_id required`);

      const item = await Item.findByPk(itemId, { transaction: t });
      if (!item) throw HttpError.badRequest(`Line ${lineNo}: item ${itemId} not found`);

      // Block if out of stock
      const bal = await StockBalance.findOne({
        where: { item_id: itemId, warehouse_id: register.warehouse_id },
        transaction: t,
      });
      const onHand = bal ? Number(bal.quantity) : 0;
      if (onHand < qty) {
        throw HttpError.conflict(`${item.name}: insufficient stock (on hand ${onHand}, requested ${qty})`);
      }

      const unitCost = bal ? Number(bal.avg_cost) : 0;
      const unitPrice = Number(ln.unit_price ?? item.sale_price ?? 0);
      const lineDiscount = Number(ln.discount || 0);
      const lineTotal = r3(unitPrice * qty - lineDiscount);

      subtotal += lineTotal;
      totalCost += unitCost * qty;

      richLines.push({
        line_no: lineNo,
        item_id: itemId,
        product_id: ln.product_id || null,
        sku: item.sku,
        name: item.name,
        quantity: qty,
        unit_price: unitPrice,
        discount: lineDiscount,
        line_total: lineTotal,
        unit_cost: unitCost,
        line_cost: r3(unitCost * qty),
      });
    }

    const total = r3(subtotal - Number(discount || 0));
    totalCost = r3(totalCost);

    // Validate payments sum to >= total (handle change for cash overpayment)
    let paidTotal = 0;
    for (const p of payments) paidTotal += Number(p.amount || 0);
    paidTotal = r3(paidTotal);
    if (paidTotal < total) throw HttpError.badRequest(`Underpayment: paid ${paidTotal} < total ${total}`);
    const changeDue = r3(paidTotal - total);

    // Customer (snapshot name for walk-in)
    let customer = null;
    if (customerId) {
      customer = await Customer.findByPk(customerId, { transaction: t });
      if (!customer) throw HttpError.badRequest('Customer not found');
    }
    // On-account payment requires customer
    const hasOnAccount = payments.some(p => p.method === 'on_account');
    if (hasOnAccount && !customer) throw HttpError.badRequest('On-account payment requires a customer');

    const branchCode = (await sequelize.models.Branch.findByPk(register.branch_id, { transaction: t }))?.code || 'MK';

    // Create sale
    const sale = await POSSale.create({
      sale_no: await nextSaleNo(branchCode),
      shift_id: shift.id,
      register_id: register.id,
      branch_id: register.branch_id,
      warehouse_id: register.warehouse_id,
      cashier_id: userId,
      customer_id: customer?.id || null,
      customer_name: customer?.full_name || 'Walk-in Customer',
      sale_date: new Date(),
      subtotal: r3(subtotal),
      discount: r3(discount),
      tax: 0,
      total,
      total_cost: totalCost,
      paid_total: paidTotal,
      change_due: changeDue,
      status: 'completed',
      notes: notes || null,
    }, { transaction: t });

    // Create lines + decrement stock + record movement
    for (const ln of richLines) {
      await POSSaleLine.create({ ...ln, sale_id: sale.id }, { transaction: t });
      const bal = await StockBalance.findOne({ where: { item_id: ln.item_id, warehouse_id: register.warehouse_id }, transaction: t });
      bal.quantity = Number(bal.quantity) - ln.quantity;
      await bal.save({ transaction: t });
      await StockMovement.create({
        movement_date: new Date().toISOString().slice(0, 10),
        movement_type: 'out',
        branch_id: register.branch_id,
        item_id: ln.item_id,
        warehouse_id: register.warehouse_id,
        quantity: ln.quantity,
        unit_cost: ln.unit_cost,
        reference: sale.sale_no,
        notes: `POS sale: ${ln.name}`,
        created_by: userId,
      }, { transaction: t });
    }

    // Create payments + resolve account
    for (const p of payments) {
      const code = paymentToAccountCode(p.method);
      const acc = accounts[code];
      await POSPayment.create({
        sale_id: sale.id,
        method: p.method,
        amount: r3(p.amount),
        reference: p.reference || null,
        account_id: acc.id,
      }, { transaction: t });
    }

    // Build the Finance JV
    // Dr each payment account by its amount
    //   (cash adjusted for change: net of change is total amount that stays with the business; for simplicity we record the gross paid and a "Cash change out" line if needed)
    // We model cash payment as exactly the paid amount; the change_due is a separate Cr from Cash (so net cash to drawer = paid - change).
    // Simpler approach: book each payment at its amount, and for cash with change, book Cr Cash by change_due so net cash = paid_cash - change.
    const jvLines = [];
    for (const p of payments) {
      const acc = accounts[paymentToAccountCode(p.method)];
      jvLines.push({ account_id: acc.id, debit: r3(p.amount), credit: 0, description: `${p.method.toUpperCase()} payment — ${sale.sale_no}` });
    }
    if (changeDue > 0) {
      // Customer over-paid cash → we give cash back, so credit Cash 1101
      jvLines.push({ account_id: accounts['1101'].id, debit: 0, credit: changeDue, description: `Change returned — ${sale.sale_no}` });
    }
    // Cr Sales Revenue at total
    jvLines.push({ account_id: accounts['4101'].id, debit: 0, credit: total, description: `Sales — ${sale.sale_no}` });
    // COGS double-entry
    if (totalCost > 0) {
      jvLines.push({ account_id: accounts['5101'].id, debit: totalCost, credit: 0, description: `COGS — ${sale.sale_no}` });
      jvLines.push({ account_id: accounts['1120'].id, debit: 0, credit: totalCost, description: `Inventory out — ${sale.sale_no}` });
    }

    const sumD = jvLines.reduce((s, l) => s + l.debit, 0);
    const sumC = jvLines.reduce((s, l) => s + l.credit, 0);
    if (r3(sumD) !== r3(sumC)) throw HttpError.badRequest(`POS JV unbalanced: Dr ${sumD} vs Cr ${sumC}`);

    const today = new Date().toISOString().slice(0, 10);
    const voucher = await Voucher.create({
      voucher_no: `SV-${new Date().getFullYear()}-${sale.sale_no}`,
      voucher_type: 'sales',
      voucher_date: today,
      branch_id: register.branch_id,
      currency_id: baseCurrency.id,
      exchange_rate: 1,
      reference: sale.sale_no,
      narration: `POS sale ${sale.sale_no}${customer ? ' to ' + customer.full_name : ''}`,
      total_debit: r3(sumD),
      total_credit: r3(sumC),
      status: 'posted',
      posted_at: new Date(),
      posted_by: userId,
      created_by: userId,
    }, { transaction: t });

    for (let i = 0; i < jvLines.length; i++) {
      const ln = jvLines[i];
      const vl = await VoucherLine.create({
        voucher_id: voucher.id, line_no: i + 1,
        account_id: ln.account_id, description: ln.description,
        debit: ln.debit, credit: ln.credit,
      }, { transaction: t });
      await GlEntry.create({
        voucher_id: voucher.id, voucher_line_id: vl.id,
        entry_date: today, branch_id: register.branch_id,
        account_id: ln.account_id, debit: ln.debit, credit: ln.credit,
        currency_id: voucher.currency_id, narration: ln.description,
      }, { transaction: t });
    }

    sale.voucher_id = voucher.id;
    await sale.save({ transaction: t });

    await t.commit();
    return { sale, voucher_id: voucher.id, voucher_no: voucher.voucher_no };
  } catch (e) { await t.rollback(); throw e; }
};

exports.voidSale = async ({ saleId, userId }) => {
  const sale = await POSSale.findByPk(saleId, { include: [{ model: POSSaleLine, as: 'lines' }] });
  if (!sale) throw HttpError.notFound('Sale not found');
  if (sale.status !== 'completed') throw HttpError.conflict('Only completed sales can be voided');

  const t = await sequelize.transaction();
  try {
    // Reverse stock
    for (const ln of sale.lines) {
      const bal = await StockBalance.findOne({ where: { item_id: ln.item_id, warehouse_id: sale.warehouse_id }, transaction: t });
      if (bal) {
        bal.quantity = Number(bal.quantity) + Number(ln.quantity);
        await bal.save({ transaction: t });
      }
      await StockMovement.create({
        movement_date: new Date().toISOString().slice(0, 10),
        movement_type: 'in',
        branch_id: sale.branch_id,
        item_id: ln.item_id,
        warehouse_id: sale.warehouse_id,
        quantity: ln.quantity,
        unit_cost: ln.unit_cost,
        reference: `VOID-${sale.sale_no}`,
        notes: `Voided POS sale ${sale.sale_no}`,
        created_by: userId,
      }, { transaction: t });
    }

    // Reverse JV by deleting GL entries and marking voucher cancelled
    if (sale.voucher_id) {
      await GlEntry.destroy({ where: { voucher_id: sale.voucher_id }, transaction: t });
      const v = await Voucher.findByPk(sale.voucher_id, { transaction: t });
      if (v) { v.status = 'cancelled'; await v.save({ transaction: t }); }
    }
    sale.status = 'voided';
    await sale.save({ transaction: t });
    await t.commit();
    return sale;
  } catch (e) { await t.rollback(); throw e; }
};
