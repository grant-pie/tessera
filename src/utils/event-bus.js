const listeners = new Map();

export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
}

export function off(event, handler) {
  listeners.get(event)?.delete(handler);
}

export function emit(event, data) {
  listeners.get(event)?.forEach(h => h(data));
}
