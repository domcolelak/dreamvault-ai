import { env } from './env';

/**
 * Guards the machine-callable endpoints. When JOB_RUNNER_TOKEN is set, the caller
 * must present it; when it is unset the endpoints stay open, which is convenient
 * locally and called out in the README as something to set in production.
 */
export function authorizeRunner(request: Request): { ok: true } | { ok: false; status: number; message: string } {
  const expected = env().JOB_RUNNER_TOKEN;
  if (expected === null) return { ok: true };

  const header = request.headers.get('authorization') ?? '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const alt = request.headers.get('x-runner-token');
  const provided = bearer ?? alt;

  if (provided === null) {
    return { ok: false, status: 401, message: 'Missing runner token.' };
  }
  if (provided !== expected) {
    return { ok: false, status: 403, message: 'Invalid runner token.' };
  }
  return { ok: true };
}
