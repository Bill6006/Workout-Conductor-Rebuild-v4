/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

/**
 * Injected by vite.config.ts `define` at build time. Typed as `unknown` on
 * purpose: the app validates it with a Zod schema (see src/app/buildInfo.ts).
 */
declare const __BUILD_INFO__: unknown;
