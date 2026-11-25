export const SESSION_MAX_MS = 8 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = SESSION_MAX_MS;
export const REFRESH_AHEAD_MS = 3 * 60 * 1000;
export const SESSION_IDLE_FLAG = "mkl-session-idle";
export const SESSION_IDLE_MESSAGE =
  "Votre session s’est terminée après 8 heures. Reconnectez-vous avec votre email et votre PIN.";

const MIN_UNIX_SECONDS = 1_600_000_000;

export function isSessionExpired(session, now = Date.now()) {
  const started = Number(session?.connected_at || 0);
  if (!started) return false;
  return now - started >= SESSION_MAX_MS;
}

export function isIdleExpired(lastActivityAt, now = Date.now()) {
  const started = Number(lastActivityAt || 0);
  if (!started) return false;
  return now - started >= SESSION_MAX_MS;
}

export function sessionIdleAt(session) {
  const last = Number(session?.last_activity_at || 0);
  return last > 0 ? last : 0;
}

export function accessTokenMsLeft({ jwtExp = 0, expiresAt = 0 } = {}, now = Date.now()) {
  const rawStored = Number(expiresAt || 0);
  const storedExp = rawStored > 1e12 ? Math.floor(rawStored / 1000) : rawStored;
  const options = [Number(jwtExp) || 0, storedExp].filter(value => value >= MIN_UNIX_SECONDS);
  const expSec = options.length ? Math.min(...options) : Math.floor(now / 1000) + 3600;
  return expSec * 1000 - now;
}

export function sessionStartedAt(session, now = Date.now()) {
  const started = Number(session?.connected_at || 0);
  return started > 0 ? started : now;
}

export function nextLastActivityAt(session, now = Date.now()) {
  const last = Number(session?.last_activity_at || 0);
  return last > 0 ? last : now;
}

export function withSessionActivity(session, now = Date.now()) {
  if (!session) return session;
  return { ...session, last_activity_at: now };
}
