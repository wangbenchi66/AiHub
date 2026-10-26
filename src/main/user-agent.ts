/**
 * Electron's default UA contains "AiHub" and "Electron", which some sites
 * (DeepSeek included) treat as an embedded/unsafe environment. Present a
 * normal Chrome UA for the webview session instead.
 */
export function chromeUserAgent(): string {
  const major = process.versions.chrome.split('.')[0]
  const platform =
    process.platform === 'darwin'
      ? 'Macintosh; Intel Mac OS X 10_15_7'
      : process.platform === 'linux'
        ? 'X11; Linux x86_64'
        : 'Windows NT 10.0; Win64; x64'
  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`
}
