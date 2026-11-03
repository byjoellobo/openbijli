import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// Content-Security-Policy for the built site (GitHub Pages cannot set headers, so it goes in
// a meta tag). Added at build time only: the dev server relies on inline scripts for HMR.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'open-tariff-csp',
    apply: 'build',
    transformIndexHtml: (html) => html.replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
  };
}

// Workspace packages are consumed from source (the "source" export condition), so the
// app always reflects the current engine and data without a separate package build.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), contentSecurityPolicy()],
  resolve: {
    conditions: ['source', 'module', 'browser', 'development|production'],
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});
