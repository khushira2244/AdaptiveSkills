import type { FastifyInstance } from "fastify";
import type { ApiError } from "@adaptive-labs/contracts";
import { HttpError } from "./http-error.js";

export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    const body: ApiError = {
      error: { code: "NOT_FOUND", message: "Route not found", requestId: request.id },
    };
    return reply.code(404).send(body);
  });

  app.setErrorHandler((error, request, reply) => {
    const statusCode = error !== null && typeof error === "object" && "statusCode" in error
      ? error.statusCode : undefined;
    const expected = error instanceof HttpError;
    const validHttpStatus = typeof statusCode === "number" && Number.isInteger(statusCode)
      && statusCode >= 400 && statusCode < 600;
    const clientError = validHttpStatus && statusCode < 500;
    const validationError = error !== null && typeof error === "object"
      && "validation" in error && Array.isArray(error.validation);
    const status = expected && validHttpStatus ? statusCode : clientError ? statusCode : 500;
    if (status >= 500) request.log.error({ err: error, method: request.method, url: request.url }, "Request failed");
    if (status === 401) reply.header("www-authenticate", "Bearer");
    const body: ApiError = {
      error: {
        code: expected ? error.code : status === 429 ? "RATE_LIMITED" : clientError ? "BAD_REQUEST" : "INTERNAL_ERROR",
        message: expected ? error.message : status === 429 ? "Too many requests; try again later" : validationError ? "Request validation failed"
          : clientError ? "Request could not be processed" : "Internal server error",
        requestId: request.id,
      },
    };
    return reply.code(status).send(body);
  });
}
