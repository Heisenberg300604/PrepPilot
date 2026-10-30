import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { Prisma } from './generated/prisma/client.js';

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Sign in to continue.') => new AppError(401, 'UNAUTHENTICATED', message);
/** Used for missing AND foreign resources so existence of other users' data is never revealed. */
export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found.`);
export const conflict = (message: string) => new AppError(409, 'CONFLICT', message);
export const unprocessable = (message: string, details?: unknown) => new AppError(422, 'INVALID_RELATIONSHIP', message, details);

export const errorHandler =
  (isProd: boolean): ErrorRequestHandler =>
  (err, req, res, _next) => {
    if (err instanceof AppError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
      return;
    }
    if (err instanceof ZodError) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: err.issues[0] ? `${err.issues[0].path.join('.') || 'request'}: ${err.issues[0].message}` : 'Invalid request.',
          details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      });
      return;
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        res.status(409).json({ error: { code: 'CONFLICT', message: 'That already exists.' } });
        return;
      }
      if (err.code === 'P2025' || err.code === 'P2003') {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found.' } });
        return;
      }
    }
    if (err?.type === 'entity.too.large') {
      res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' } });
      return;
    }
    if (err?.type === 'entity.parse.failed') {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Malformed JSON body.' } });
      return;
    }
    (req as any).log?.error({ err }, "unhandled error");
    if (process.env.DEBUG_ERRORS) console.error(err);
    res.status(500).json({
      error: { code: 'INTERNAL', message: 'Something went wrong on our side. Please try again.', ...(isProd ? {} : { details: String(err?.message ?? err) }) },
    });
  };
