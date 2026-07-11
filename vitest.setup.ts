import '@testing-library/jest-dom/vitest'

// jsdom doesn't implement matchMedia. Default every test to the desktop layout
// (matches: false); component tests that exercise the mobile layout override
// window.matchMedia themselves.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}
