import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';

/**
 * Uniform error envelope:
 * { statusCode, error, message, errors?: string[], path, method, timestamp }
 * Never leaks stack traces or database details to clients.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpError');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'Internal Server Error';
    let errors: string[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const b = body as { message?: string | string[]; error?: string };
        if (Array.isArray(b.message)) {
          errors = b.message;
          message = 'Validation failed';
        } else if (b.message) {
          message = b.message;
        }
        if (b.error) error = b.error;
      }
      if (!errors && error === 'Internal Server Error') error = HttpStatus[status] ?? 'Error';
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      error = 'Bad Request';
      message = 'Invalid or missing fields in request';
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          status = HttpStatus.CONFLICT;
          error = 'Conflict';
          message = 'A record with the same unique value already exists';
          break;
        case 'P2003':
          status = HttpStatus.BAD_REQUEST;
          error = 'Bad Request';
          message = 'Referenced record does not exist';
          break;
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          error = 'Not Found';
          message = 'Record not found';
          break;
        default:
          status = HttpStatus.BAD_REQUEST;
          error = 'Bad Request';
          message = 'Database request could not be processed';
      }
    } else if ((exception as any)?.type === 'entity.too.large') {
      status = HttpStatus.PAYLOAD_TOO_LARGE;
      error = 'Payload Too Large';
      message = 'Request body is too large';
    } else if ((exception as any)?.code === 'LIMIT_FILE_SIZE') {
      status = HttpStatus.PAYLOAD_TOO_LARGE;
      error = 'Payload Too Large';
      message = 'Uploaded file exceeds the size limit';
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}: ${exception instanceof Error ? exception.message : String(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
      if (process.env.SENTRY_DSN) {
        Sentry.captureException(exception);
      }
    }

    response.status(status).json({
      statusCode: status,
      error,
      message,
      ...(errors ? { errors } : {}),
      path: request.url,
      method: request.method,
      timestamp: new Date().toISOString(),
    });
  }
}
