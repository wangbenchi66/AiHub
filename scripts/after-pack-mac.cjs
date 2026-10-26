const { execFileSync } = require('node:child_process')
const { join } = require('node:path')

/**
 * macOS: 没有 Apple Developer 证书时，至少做 ad-hoc 签名。
 * 这不会让 Gatekeeper 认为开发者可信，但能避免部分“应用已损坏”的错误。
 */
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appName = context.packager.appInfo.productFilename
  const appPath = join(context.appOutDir, `${appName}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
}
