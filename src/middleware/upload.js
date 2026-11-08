// Multer config for financial-upload files.
// Files land on disk in UPLOADS_DIR, keyed by job id (written after creation).
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const UPLOADS_DIR = process.env.FIN_UPLOADS_DIR
  || path.resolve(__dirname, '../../uploads/financial');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ts = Date.now();
    const safe = file.originalname.replace(/[^\w.\-؀-ۿ]+/g, '_').slice(-80);
    cb(null, `${ts}_${safe}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const ok = /\.(xls|xlsx|xlsm|csv)$/i.test(file.originalname);
  if (!ok) return cb(new Error('Only .xls, .xlsx, .xlsm or .csv files are accepted'));
  cb(null, true);
};

module.exports = multer({
  storage,
  fileFilter,
  limits: { fileSize: 128 * 1024 * 1024 }, // 128 MB
});

module.exports.UPLOADS_DIR = UPLOADS_DIR;
