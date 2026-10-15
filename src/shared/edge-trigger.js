export const EDGE_TRIGGER_KEY = 'arcSidebarEdgeTrigger';
export const DEFAULT_EDGE_TRIGGER = Object.freeze({ height: 100, offset: 0, width: 16 });
export function edgeTrigger(value) {
  const finite = (name, fallback) => Number.isFinite(value?.[name]) ? Math.round(value[name]) : fallback;
  const height = Math.max(20, Math.min(100, finite('height', 100)));
  return { height, offset: Math.max(0, Math.min(100 - height, finite('offset', 0))), width: Math.max(10, Math.min(22, finite('width', 16))) };
}
export function isEdgeTrigger(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    ['height', 'offset', 'width'].every(key => Number.isInteger(value[key])) &&
    JSON.stringify(edgeTrigger(value)) === JSON.stringify({height:value.height, offset:value.offset, width:value.width}));
}
