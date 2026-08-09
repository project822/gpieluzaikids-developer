// Audit trail keamanan dashboard developer (pola sama dengan website utama).
// Menulis ke console + buffer in-memory (maks 500 entri — tertua dibuang).
// Tipe: failed_login | rate_limit | csrf | origin | body_limit | auth.

const MAX_ENTRIES = 500;
const buffer = [];

export function logSecurityEvent({ type, ip, path, detail } = {}) {
  const entry = {
    type: type || 'unknown',
    ip: ip || 'unknown',
    path: path || '',
    detail: detail || '',
    at: new Date().toISOString(),
  };
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.shift();
  console.warn(`[security] ${entry.type} ip=${entry.ip} path=${entry.path} ${entry.detail}`);
  return entry;
}

export function getSecurityLog() {
  return [...buffer];
}
