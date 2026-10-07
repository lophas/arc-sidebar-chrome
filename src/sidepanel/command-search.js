export function navigationUrl(value) {
  const text = value.trim();
  if (/^(https?|chrome|file):\/\//i.test(text)) {
    try { return new URL(text).href; } catch { return null; }
  }
  if (/^(localhost|(?:[\p{L}\d-]+\.)+[\p{L}\d-]+)(?::\d+)?(?:[/?#][^\s]*)?$/u.test(text)) {
    try { return new URL(`https://${text}`).href; } catch {}
  }
  return null;
}
const normalize = text => String(text || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
export function buildResults(data, value) {
  const text = value.trim(), q = normalize(text), tokens = q.split(/\s+/).filter(Boolean);
  const results = data.filter(item => tokens.every(token => normalize(`${item.title} ${item.url || ''} ${item.detail || ''}`).includes(token)))
    .map((item, index) => ({ item, index, score: normalize(item.title) === q ? 3 : normalize(item.title).startsWith(q) ? 2 : 1 }))
    .sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 30).map(x => x.item);
  if (text) {
    const url = navigationUrl(text);
    if (url) results.unshift({ kind: 'URL', title: `Open ${text}`, url });
    results.push({ kind: 'Search', title: `Search Google for “${text}”`, url: `https://www.google.com/search?q=${encodeURIComponent(text)}` });
  }
  return results;
}
