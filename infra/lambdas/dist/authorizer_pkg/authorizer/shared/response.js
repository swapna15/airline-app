"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ok = ok;
exports.created = created;
exports.noContent = noContent;
exports.badRequest = badRequest;
exports.unauthorized = unauthorized;
exports.forbidden = forbidden;
exports.notFound = notFound;
exports.serverError = serverError;
exports.parseBody = parseBody;
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': process.env.FRONTEND_URL ?? '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Content-Type': 'application/json',
};
function ok(body, status = 200) {
    return { statusCode: status, headers: CORS_HEADERS, body: JSON.stringify(body) };
}
function created(body) {
    return ok(body, 201);
}
function noContent() {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
}
function badRequest(message) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: message }) };
}
function unauthorized(message = 'Unauthorized') {
    return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: message }) };
}
function forbidden(message = 'Forbidden') {
    return { statusCode: 403, headers: CORS_HEADERS, body: JSON.stringify({ error: message }) };
}
function notFound(resource = 'Resource') {
    return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: `${resource} not found` }) };
}
function serverError(err) {
    console.error(err);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Internal server error' }) };
}
/** Parse and validate JSON body — returns null if invalid */
function parseBody(body) {
    try {
        return JSON.parse(body ?? '');
    }
    catch {
        return null;
    }
}
