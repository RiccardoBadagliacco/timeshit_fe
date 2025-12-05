/**
 * Quick localStorage/sessionStorage polyfill for Node 25+ dev runtime.
 * Next.js dev overlay touches localStorage server-side; the built-in
 * Node webstorage getter currently exposes no-op methods and crashes.
 */
function makeStore() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
    get length() {
      return store.size;
    },
  };
}

function patchStorage(name) {
  const desc = Object.getOwnPropertyDescriptor(globalThis, name);
  if (!desc || desc.value?.getItem) return;
  // Override the experimental getter with a minimal sync store.
  Object.defineProperty(globalThis, name, {
    value: makeStore(),
    configurable: true,
    enumerable: true,
    writable: false,
  });
}

patchStorage("localStorage");
patchStorage("sessionStorage");
