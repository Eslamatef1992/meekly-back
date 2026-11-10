const path = require('path');
const fs = require('fs');
const { Op } = require('sequelize');
const { FinancialUploadJob, FiscalPeriod, Branch, User } = require('../models');
const svc = require('../services/financialUpload.service');
const HttpError = require('../utils/HttpError');

exports.list = async (req, res, next) => {
  try {
    const { fiscal_period_id, upload_type, status, page = 1, page_size = 25 } = req.query;
    const where = {};
    if (fiscal_period_id) where.fiscal_period_id = fiscal_period_id;
    if (upload_type)      where.upload_type = upload_type;
    if (status)           where.status = status;

    const limit = Math.min(Number(page_size) || 25, 200);
    const offset = (Number(page) - 1) * limit;

    const { rows, count } = await FinancialUploadJob.findAndCountAll({
      where,
      order: [['id', 'DESC']],
      limit, offset,
      include: [
        { model: FiscalPeriod, attributes: ['code', 'name'] },
        { model: Branch,       attributes: ['code', 'name'] },
        { model: User, as: 'uploader', attributes: ['id', 'email', 'full_name'] },
      ],
    });

    res.json({ data: rows, total: count, page: Number(page), page_size: limit });
  } catch (e) { next(e); }
};

exports.get = async (req, res, next) => {
  try {
    const job = await FinancialUploadJob.findByPk(req.params.id, {
      include: [
        { model: FiscalPeriod, attributes: ['code', 'name'] },
        { model: Branch,       attributes: ['code', 'name'] },
        { model: User, as: 'uploader', attributes: ['id', 'email', 'full_name'] },
      ],
    });
    if (!job) throw HttpError.notFound('Job not found');
    res.json(job);
  } catch (e) { next(e); }
};

exports.create = async (req, res, next) => {
  try {
    if (!req.file) throw HttpError.badRequest('File is required (field: file)');
    const { fiscal_period_id, upload_type, company_id, branch_id } = req.body;
    if (!fiscal_period_id) throw HttpError.badRequest('fiscal_period_id is required');
    if (!['chart_of_accounts', 'vouchers'].includes(upload_type)) {
      throw HttpError.badRequest('upload_type must be "chart_of_accounts" or "vouchers"');
    }

    const period = await FiscalPeriod.findByPk(fiscal_period_id);
    if (!period) throw HttpError.badRequest('Invalid fiscal_period_id');

    const job = await FinancialUploadJob.create({
      fiscal_period_id: period.id,
      company_id: company_id || null,
      branch_id:  branch_id  || null,
      upload_type,
      original_filename: req.file.originalname,
      stored_filename:   req.file.filename,
      file_size:         req.file.size,
      status: 'queued',
      uploaded_by: req.user.sub,
      options_json: JSON.stringify({
        company_id: company_id || null,
        branch_id:  branch_id  || null,
      }),
    });

    // Fire-and-forget — the queue drains in the background.
    svc.enqueue(job.id);

    res.status(201).json(job);
  } catch (e) {
    // clean up the orphaned upload on error
    if (req.file && req.file.path) { try { fs.unlinkSync(req.file.path); } catch {} }
    next(e);
  }
};

exports.rollback = async (req, res, next) => {
  try {
    const job = await svc.rollbackJob(req.params.id);
    res.json(job);
  } catch (e) { next(e); }
};

exports.destroy = async (req, res, next) => {
  try {
    const job = await FinancialUploadJob.findByPk(req.params.id);
    if (!job) throw HttpError.notFound('Job not found');
    if (['queued', 'processing'].includes(job.status)) {
      throw HttpError.conflict('Cannot delete a job that is still running');
    }
    // delete the file too
    const fp = path.join(
      process.env.FIN_UPLOADS_DIR || path.resolve(__dirname, '../../uploads/financial'),
      job.stored_filename,
    );
    try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch {}
    await job.destroy();
    res.status(204).end();
  } catch (e) { next(e); }
};
