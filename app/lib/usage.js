import { actionLabel } from "./activity-logs.js";

export const HEARTBEAT_MS = 60_000;
export const IDLE_GAP_MS = 3 * 60_000;
export const MAX_USAGE_DAYS = 31;

export function parisDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function sanitizeDay(value) {
  const text = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

export function addDays(day, delta) {
  const [year, month, date] = String(day).split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, date + Number(delta || 0)));
  return next.toISOString().slice(0, 10);
}

export function listDays(fromDay, toDay) {
  const start = sanitizeDay(fromDay);
  const end = sanitizeDay(toDay);
  if (!start || !end || start > end) return [];
  const days = [];
  let current = start;
  while (current <= end && days.length < MAX_USAGE_DAYS) {
    days.push(current);
    current = addDays(current, 1);
  }
  return days;
}

export function defaultUsageRange(now = new Date()) {
  const toDay = parisDay(now);
  return { fromDay: addDays(toDay, -6), toDay };
}

export function clampUsageRange(fromDay, toDay, now = new Date()) {
  const fallback = defaultUsageRange(now);
  let from = sanitizeDay(fromDay) || fallback.fromDay;
  let to = sanitizeDay(toDay) || fallback.toDay;
  if (from > to) {
    const swap = from;
    from = to;
    to = swap;
  }
  if (listDays(from, to).length >= MAX_USAGE_DAYS) {
    from = addDays(to, -(MAX_USAGE_DAYS - 1));
  }
  return { fromDay: from, toDay: to };
}

export function parisDayStartUtc(day) {
  const safe = sanitizeDay(day);
  if (!safe) return null;
  const [year, month, date] = safe.split("-").map(Number);
  for (let hour = -12; hour <= 36; hour += 1) {
    const candidate = new Date(Date.UTC(year, month - 1, date, hour, 0, 0, 0));
    if (parisDay(candidate) !== safe) continue;
    let time = candidate.getTime();
    while (parisDay(new Date(time - 60_000)) === safe) time -= 60_000;
    while (parisDay(new Date(time - 1)) === safe) time -= 1;
    return new Date(time);
  }
  return new Date(`${safe}T00:00:00.000Z`);
}

export function parisDayEndUtc(day) {
  const nextStart = parisDayStartUtc(addDays(day, 1));
  if (!nextStart) return null;
  return new Date(nextStart.getTime() - 1);
}

export function formatDurationMs(ms) {
  const value = Math.max(0, Number(ms || 0));
  const totalMinutes = Math.round(value / 60_000);
  if (value === 0) return "0 min";
  if (totalMinutes < 1) return "moins d’1 min";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes} min`;
  if (!minutes) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

export function formatUsageDay(day) {
  const safe = sanitizeDay(day);
  if (!safe) return "";
  return new Date(`${safe}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function shouldContinueSession(lastSeenAt, now = Date.now()) {
  const last = Date.parse(lastSeenAt);
  if (!Number.isFinite(last)) return false;
  return now - last <= IDLE_GAP_MS;
}

export function mergeModules(existing = [], nextModule) {
  const list = (Array.isArray(existing) ? existing : [])
    .map(value => String(value || "").trim())
    .filter(Boolean);
  const moduleName = String(nextModule || "").trim().slice(0, 80);
  if (moduleName && !list.includes(moduleName)) list.push(moduleName);
  return list.slice(0, 40);
}

export function sessionDurationMs(session, now = Date.now()) {
  const start = Date.parse(session?.started_at);
  const last = Date.parse(session?.last_seen_at);
  if (!Number.isFinite(start) || !Number.isFinite(last)) return 0;
  const base = Math.max(0, last - start);
  const idleFor = now - last;
  if (idleFor >= 0 && idleFor <= IDLE_GAP_MS) return base + idleFor;
  return base || HEARTBEAT_MS;
}

export function applyHeartbeat({
  existing,
  now = new Date(),
  module,
  userId,
  userName,
  organizationId,
}) {
  const moduleName = String(module || "Applications").trim().slice(0, 80) || "Applications";
  const nowIso = now.toISOString();
  const day = parisDay(now);
  const sameDay = existing?.day === day || String(existing?.day || "").slice(0, 10) === day;
  if (existing && sameDay && shouldContinueSession(existing.last_seen_at, now.getTime())) {
    return {
      type: "update",
      id: existing.id,
      patch: {
        last_seen_at: nowIso,
        last_module: moduleName,
        modules: mergeModules(existing.modules, moduleName),
        user_name: userName || existing.user_name || null,
      },
    };
  }
  return {
    type: "insert",
    row: {
      organization_id: organizationId,
      user_id: userId,
      user_name: userName || null,
      day,
      started_at: nowIso,
      last_seen_at: nowIso,
      last_module: moduleName,
      modules: mergeModules([], moduleName),
    },
  };
}

function ensureUser(map, id, fallback = {}) {
  const key = id || "unknown";
  if (!map.has(key)) {
    map.set(key, {
      userId: key,
      userName: fallback.userName || "Utilisateur",
      role: fallback.role || "",
      email: fallback.email || "",
      active: fallback.active !== false,
      totalMs: 0,
      dayMap: new Map(),
    });
  } else if (fallback.userName && map.get(key).userName === "Utilisateur") {
    map.get(key).userName = fallback.userName;
  }
  const user = map.get(key);
  if (fallback.role) user.role = fallback.role;
  if (fallback.email) user.email = fallback.email;
  if (fallback.active === false) user.active = false;
  return user;
}

function ensureDay(user, day) {
  if (!user.dayMap.has(day)) {
    user.dayMap.set(day, {
      day,
      durationMs: 0,
      modules: [],
      sessions: [],
      actions: [],
    });
  }
  return user.dayMap.get(day);
}

export function buildUsageReport({
  profiles = [],
  sessions = [],
  logs = [],
  fromDay,
  toDay,
  now = Date.now(),
}) {
  const range = clampUsageRange(fromDay, toDay, new Date(now));
  const allowedDays = new Set(listDays(range.fromDay, range.toDay));
  const byUser = new Map();

  for (const profile of profiles) {
    if (!profile?.id) continue;
    ensureUser(byUser, profile.id, {
      userName: profile.full_name || profile.email || "Utilisateur",
      role: profile.role || "",
      email: profile.email || "",
      active: profile.active !== false,
    });
  }

  for (const session of sessions) {
    const day = String(session.day || "").slice(0, 10);
    if (!allowedDays.has(day)) continue;
    const user = ensureUser(byUser, session.user_id, { userName: session.user_name });
    const dayRow = ensureDay(user, day);
    const ms = sessionDurationMs(session, now);
    dayRow.durationMs += ms;
    user.totalMs += ms;
    for (const moduleName of mergeModules(session.modules, session.last_module)) {
      dayRow.modules = mergeModules(dayRow.modules, moduleName);
    }
    dayRow.sessions.push({
      startedAt: session.started_at,
      lastSeenAt: session.last_seen_at,
      durationMs: ms,
      durationLabel: formatDurationMs(ms),
      modules: mergeModules(session.modules, session.last_module),
    });
  }

  for (const log of logs) {
    const day = parisDay(new Date(log.created_at));
    if (!allowedDays.has(day)) continue;
    const user = ensureUser(byUser, log.user_id, { userName: log.user_name });
    const dayRow = ensureDay(user, day);
    dayRow.actions.push({
      id: log.id,
      at: log.created_at,
      action: log.action,
      label: actionLabel(log.action),
      module: log.module,
      entityLabel: log.entity_label || log.entityLabel || "",
    });
  }

  const users = [...byUser.values()]
    .map(user => {
      const days = [...user.dayMap.values()]
        .map(day => ({
          ...day,
          label: formatUsageDay(day.day),
          durationLabel: formatDurationMs(day.durationMs),
          sessions: [...day.sessions].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt)),
          actions: [...day.actions].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)),
        }))
        .sort((a, b) => String(b.day).localeCompare(String(a.day)));
      return {
        userId: user.userId,
        userName: user.userName,
        role: user.role,
        email: user.email,
        active: user.active,
        totalMs: user.totalMs,
        durationLabel: formatDurationMs(user.totalMs),
        days,
      };
    })
    .filter(user => user.userId !== "unknown")
    .sort((a, b) => b.totalMs - a.totalMs || String(a.userName).localeCompare(String(b.userName), "fr"));

  return { fromDay: range.fromDay, toDay: range.toDay, users };
}
