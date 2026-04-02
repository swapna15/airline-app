import type { APIGatewayProxyResult } from 'aws-lambda';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.FRONTEND_URL ?? '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Content-Type': 'application/json',
};

export function ok(body: unknown, status = 200): APIGatewayProxyResult {
  return { statusCode: status, headers: CORS_HEADERS, body: JSON.stringify(body) };
}

export function created(body: unknown): APIGatewayProxyResult {
  return ok(body, 201);
}

export function noContent(): APIGatewayProxyResult {
  return { statusCode: 204, headers: CORS_HEADERS, body: '' };
}

export function badRequest(message: string): APIGatewayProxyResult {
  return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: message }) };
}

export function unauthorized(message = 'Unauthorized'): APIGatewayProxyResult {
  return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: message }) };
}

export function forbidden(message = 'Forbidden'): APIGatewayProxyResult {
  return { statusCode: 403, headers: CORS_HEADERS, body: JSON.stringify({ error: message }) };
}

export function notFound(resource = 'Resource'): APIGatewayProxyResult {
  return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: `${resource} not found` }) };
}

export function serverError(err: unknown): APIGatewayProxyResult {
  console.error(err);
  return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Internal server error' }) };
}

/** Parse and validate JSON body — returns null if invalid */
export function parseBody<T>(body: string | null): T | null {
  try { return JSON.parse(body ?? ''); } catch { return null; }
}
