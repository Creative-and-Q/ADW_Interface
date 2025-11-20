/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
  readonly glob: <T = any>(pattern: string | string[], options?: {
    eager?: boolean
    import?: string
    as?: string
  }) => Record<string, T>
}
