/// <reference types="vite/client" />

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

declare const __SIMPLE_MODE__: boolean;
declare const __DISABLE_GITHUB_STARS__: boolean;
declare const __DISABLED_TOOLS__: string[];
declare const __ENGINE_VERSION__: string;
