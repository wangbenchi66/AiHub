/// <reference types="vite/client" />

import type { AiHubApi } from '@shared/types'

declare global {
  interface Window {
    aihub: AiHubApi
  }
}

export {}
