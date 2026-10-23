import { HttpError } from '../lib/http-error.js';

export function validateBody(schema) {
  return (request, _response, next) => {
    const result = schema.safeParse(request.body);
    if (!result.success) {
      return next(new HttpError(400, 'Request body is invalid.', result.error.flatten()));
    }
    request.validatedBody = result.data;
    return next();
  };
}

export function validateParams(schema) {
  return (request, _response, next) => {
    const result = schema.safeParse(request.params);
    if (!result.success) {
      return next(new HttpError(400, 'Request parameters are invalid.', result.error.flatten()));
    }
    request.validatedParams = result.data;
    return next();
  };
}

export function validateQuery(schema) {
  return (request, _response, next) => {
    const result = schema.safeParse(request.query);
    if (!result.success) {
      return next(new HttpError(400, 'Query parameters are invalid.', result.error.flatten()));
    }
    request.validatedQuery = result.data;
    return next();
  };
}
