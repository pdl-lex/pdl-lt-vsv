/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optionale absolute Basis-URL der API (leer = relativ, via Dev-Proxy). */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
