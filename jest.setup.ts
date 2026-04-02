import '@testing-library/jest-dom';

// jsdom doesn't implement scrollIntoView — guard for node test environments
if (typeof window !== 'undefined') {
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
}
