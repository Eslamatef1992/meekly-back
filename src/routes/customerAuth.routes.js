/**
 * Storefront customer authentication.
 *   POST /api/ecom/auth/register      — signup with name, email, phone, password
 *   POST /api/ecom/auth/login-otp     — phone-only login: generates OTP, stores it, returns it in dev
 *   POST /api/ecom/auth/verify-otp    — verify 6-digit code, returns JWT
 *   POST /api/ecom/auth/login-pwd     — fallback: email + password login (mostly for testing)
 *   GET  /api/ecom/auth/me            — current customer from token
 */
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { Customer, sequelize } = require('../models');
const HttpError = require('../utils/HttpError');

const SECRET = process.env.JWT_SECRET || 'dev_secret';
const TTL    = process.env.JWT_ACCESS_TTL || '14d';

function normalizePhone(p) {
  if (!p) return null;
  return String(p).replace(/\s+/g, '').replace(/[^+\d]/g, '');
}

function customerToken(c) {
  return jwt.sign({
    cust: c.id,
    email: c.email,
    name: c.full_name,
    phone: c.phone,
    type: 'customer',
  }, SECRET, { expiresIn: TTL });
}

function customerAuthRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Login required' });
  try {
    const payload = jwt.verify(token, SECRET);
    if (payload.type !== 'customer') return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Wrong token type' });
    req.customer = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid or expired token' });
  }
}

// ============================================================
// REGISTER
// ============================================================
router.post('/register', async (req, res, next) => {
  try {
    const { full_name, email, phone, password } = req.body || {};
    if (!full_name || !email || !phone || !password) {
      throw HttpError.badRequest('full_name, email, phone, password required');
    }
    if (String(password).length < 6) throw HttpError.badRequest('Password must be at least 6 characters');
    const cleanPhone = normalizePhone(phone);

    const existing = await Customer.findOne({ where: { [Op.or]: [{ email }, { phone: cleanPhone }] } });
    if (existing) {
      if (existing.email === email) throw HttpError.conflict('Email already registered');
      throw HttpError.conflict('Phone already registered');
    }
    const password_hash = await bcrypt.hash(password, 10);
    const customer = await Customer.create({
      full_name,
      email,
      phone: cleanPhone,
      password_hash,
      country: 'Kuwait',
    });
    const token = customerToken(customer);
    res.status(201).json({
      accessToken: token,
      customer: {
        id: customer.id, full_name: customer.full_name,
        email: customer.email, phone: customer.phone,
      },
    });
  } catch (e) { next(e); }
});

// ============================================================
// LOGIN — phone OTP
// ============================================================
router.post('/login-otp', async (req, res, next) => {
  try {
    const phone = normalizePhone(req.body?.phone);
    if (!phone) throw HttpError.badRequest('Phone required');
    const customer = await Customer.findOne({ where: { phone } });
    if (!customer) throw HttpError.notFound('No account with this phone. Sign up first.');

    const otp = String(Math.floor(100000 + Math.random() * 900000));   // 6-digit
    const expires_at = new Date(Date.now() + 5 * 60 * 1000);            // 5 minutes

    await sequelize.query(
      `INSERT INTO customer_otps (phone, code, expires_at, used) VALUES (:phone, :code, :exp, 0)
       ON DUPLICATE KEY UPDATE code=VALUES(code), expires_at=VALUES(expires_at), used=0`,
      { replacements: { phone, code: otp, exp: expires_at } }
    );

    // In production this is sent via SMS. For now we return it directly so testing works.
    const devMode = process.env.NODE_ENV !== 'production';
    res.json({
      ok: true,
      message: devMode ? `OTP: ${otp} (dev mode — sent in response)` : 'OTP sent via SMS',
      ...(devMode ? { otp } : {}),
      expires_in_seconds: 5 * 60,
    });
  } catch (e) { next(e); }
});

router.post('/verify-otp', async (req, res, next) => {
  try {
    const phone = normalizePhone(req.body?.phone);
    const code = String(req.body?.code || '').trim();
    if (!phone || !code) throw HttpError.badRequest('phone and code required');

    const [rows] = await sequelize.query(
      `SELECT id, code, expires_at, used FROM customer_otps WHERE phone = :phone ORDER BY id DESC LIMIT 1`,
      { replacements: { phone } }
    );
    if (!rows.length) throw HttpError.unauthorized('No OTP requested for this phone');
    const otp = rows[0];
    if (otp.used) throw HttpError.unauthorized('OTP already used — request a new one');
    if (new Date(otp.expires_at) < new Date()) throw HttpError.unauthorized('OTP expired — request a new one');
    if (String(otp.code) !== code) throw HttpError.unauthorized('Incorrect code');

    await sequelize.query('UPDATE customer_otps SET used = 1 WHERE id = :id', { replacements: { id: otp.id } });

    const customer = await Customer.findOne({ where: { phone } });
    if (!customer) throw HttpError.notFound('Customer not found');
    const token = customerToken(customer);
    res.json({
      accessToken: token,
      customer: {
        id: customer.id, full_name: customer.full_name,
        email: customer.email, phone: customer.phone,
      },
    });
  } catch (e) { next(e); }
});

// ============================================================
// LOGIN — email + password (fallback)
// ============================================================
router.post('/login-pwd', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) throw HttpError.badRequest('email and password required');
    const customer = await Customer.findOne({ where: { email } });
    if (!customer || !customer.password_hash) throw HttpError.unauthorized('Invalid credentials');
    const ok = await bcrypt.compare(password, customer.password_hash);
    if (!ok) throw HttpError.unauthorized('Invalid credentials');
    const token = customerToken(customer);
    res.json({
      accessToken: token,
      customer: {
        id: customer.id, full_name: customer.full_name,
        email: customer.email, phone: customer.phone,
      },
    });
  } catch (e) { next(e); }
});

// ============================================================
// ME
// ============================================================
router.get('/me', customerAuthRequired, async (req, res, next) => {
  try {
    const c = await Customer.findByPk(req.customer.cust);
    if (!c) throw HttpError.notFound('Customer not found');
    res.json({
      id: c.id, full_name: c.full_name, email: c.email, phone: c.phone,
      city: c.city, area: c.area, address_line1: c.address_line1,
    });
  } catch (e) { next(e); }
});

module.exports = router;
