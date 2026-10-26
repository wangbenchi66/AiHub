import { app } from 'electron'

export function appVersion(): string {
  const version = app.getVersion()
  // In `electron out/main/index.js` dev mode Electron reports its own version.
  return version === process.versions.electron ? '0.1.0' : version
}
