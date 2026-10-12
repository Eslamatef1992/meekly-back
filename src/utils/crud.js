// Tiny generic CRUD helpers to keep stub routes concise.
const HttpError = require('./HttpError');

function buildCrud(Model, opts = {}) {
  const search = opts.searchFields || [];
  const { Op } = require('sequelize');
  return {
    list: async (req, res, next) => {
      try {
        const { q, page = 1, page_size = 50 } = req.query;
        const where = {};
        if (q && search.length) where[Op.or] = search.map(f => ({ [f]: { [Op.like]: `%${q}%` } }));
        const limit = Math.min(Number(page_size) || 50, 200);
        const offset = (Number(page) - 1) * limit;
        const { rows, count } = await Model.findAndCountAll({ where, limit, offset, order: [[opts.orderBy || 'id', 'DESC']] });
        res.json({ data: rows, total: count, page: Number(page), page_size: limit });
      } catch (e) { next(e); }
    },
    get: async (req, res, next) => {
      try {
        const row = await Model.findByPk(req.params.id);
        if (!row) throw HttpError.notFound();
        res.json(row);
      } catch (e) { next(e); }
    },
    create: async (req, res, next) => {
      try {
        const row = await Model.create(req.body);
        res.status(201).json(row);
      } catch (e) { next(e); }
    },
    update: async (req, res, next) => {
      try {
        const row = await Model.findByPk(req.params.id);
        if (!row) throw HttpError.notFound();
        Object.assign(row, req.body);
        await row.save();
        res.json(row);
      } catch (e) { next(e); }
    },
    remove: async (req, res, next) => {
      try {
        const row = await Model.findByPk(req.params.id);
        if (!row) throw HttpError.notFound();
        await row.destroy();
        res.json({ ok: true });
      } catch (e) { next(e); }
    },
  };
}

module.exports = { buildCrud };
