class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    if (details) this.details = details;
  }
}
HttpError.badRequest = (msg, details) => new HttpError(400, 'BAD_REQUEST', msg, details);
HttpError.unauthorized = (msg = 'Unauthorized') => new HttpError(401, 'UNAUTHORIZED', msg);
HttpError.forbidden = (msg = 'Forbidden') => new HttpError(403, 'FORBIDDEN', msg);
HttpError.notFound = (msg = 'Not found') => new HttpError(404, 'NOT_FOUND', msg);
HttpError.conflict = (msg, details) => new HttpError(409, 'CONFLICT', msg, details);

module.exports = HttpError;
