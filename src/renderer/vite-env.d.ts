/// <reference types="vite/client" />
import type { DownloadApi } from '../shared/download'
declare global {
  interface Window {
    downloads: DownloadApi
  }
}
export {}
