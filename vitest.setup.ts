/**
 * Test environment shims. Nothing here touches the network or a provider:
 * these only fill gaps in jsdom so browser libraries can be imported.
 */
if (typeof window !== 'undefined') {
  // MapLibre creates a worker blob URL at import time; jsdom has no createObjectURL.
  if (typeof window.URL.createObjectURL !== 'function') {
    Object.defineProperty(window.URL, 'createObjectURL', {
      value: () => 'blob:railtrack-test',
      writable: true,
    });
    Object.defineProperty(window.URL, 'revokeObjectURL', { value: () => {}, writable: true });
  }
  // jsdom has no canvas backend, so WebGL is absent on purpose: this is the
  // "no GPU / VM / acceleration off" case the map fallback exists for.
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
      writable: true,
    });
  }
}

// jsdom has no canvas backend and logs "Not implemented: getContext" as an
// error for every call. Returning null is the truthful answer — no WebGL here —
// and it keeps the output readable. Individual tests can still spy on it.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
}
