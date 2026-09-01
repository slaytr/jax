/**
 * The house response envelope (~/.claude/rules/typescript/patterns.md):
 * every JSON response is `{success, data, error}`, `data` null on error and
 * `error` null on success. Two tiny helpers so every route builds it the
 * same way instead of hand-rolling the shape.
 */

export function ok(reply, data, statusCode = 200) {
  return reply.code(statusCode).send({ success: true, data, error: null });
}

export function fail(reply, statusCode, message) {
  return reply.code(statusCode).send({ success: false, data: null, error: message });
}
