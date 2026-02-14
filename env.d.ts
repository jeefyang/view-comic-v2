// env.d.ts （放在项目根目录）
/// <reference types="vite/client" />

// =============== 前端环境变量（通过 import.meta.env 访问）===============
interface ImportMetaEnv {
  // Vite 只暴露以 VITE_ 开头的变量到前端
  // readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// =============== 后端环境变量（通过 process.env 访问）===============
declare namespace NodeJS {
  interface ProcessEnv {
    // .env 中的自定义变量（后端专用）
    DEFAULT_USERNAME?: string;
    DEFAULT_PASSWORD?: string;

    // Node.js 内置变量（可选，增强类型）
    NODE_ENV?: 'development' | 'production' | 'test';
    PORT?: string;
  }
}