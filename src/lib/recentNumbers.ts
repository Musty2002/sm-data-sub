const MAX = 3;

export function getRecentNumbers(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function addRecentNumber(key: string, phone: string): string[] {
  const clean = (phone || '').trim();
  if (!clean) return getRecentNumbers(key);
  const next = [clean, ...getRecentNumbers(key).filter((n) => n !== clean)].slice(0, MAX);
  try {
    localStorage.setItem(key, JSON.stringify(next));
  } catch {}
  return next;
}
