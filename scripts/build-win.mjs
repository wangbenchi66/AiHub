import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  rmSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const isWindows = process.platform === 'win32'
const cwd = process.cwd()
const isAscii = (value) => /^[\x00-\x7F]+$/.test(value)

function run(command, args, options = {}) {
  execFileSync(command, args, {
    stdio: 'inherit',
    shell: isWindows,
    env: {
      ...process.env,
      CSC_IDENTITY_AUTO_DISCOVERY: 'false',
      ELECTRON_MIRROR:
        process.env.ELECTRON_MIRROR ?? 'https://npmmirror.com/mirrors/electron/',
      ELECTRON_BUILDER_BINARIES_MIRROR:
        process.env.ELECTRON_BUILDER_BINARIES_MIRROR ??
        'https://npmmirror.com/mirrors/electron-builder-binaries/'
    },
    ...options
  })
}

if (!isWindows) {
  console.error('build:win 需要在 Windows 上运行')
  process.exit(1)
}

run('npm', ['run', 'sync:bridge'])
run('npm', ['run', 'build'])

// NSIS 的两段式构建会在“运行安装器生成卸载器”这一步失败于非 ASCII 输出路径。
// 项目路径含中文时，改用 ASCII 的临时输出目录，构建后再把产物复制回 release。
const targetDir = isAscii(cwd) ? join(cwd, 'release') : join(tmpdir(), 'aihub-build')
const release = join(cwd, 'release')
const needsCopy = targetDir !== release

if (!isAscii(targetDir)) {
  console.error(`构建输出路径仍包含非 ASCII 字符：${targetDir}`)
  console.error('请设置环境变量 AIHUB_BUILD_OUTPUT 到一个纯英文路径，例如 E:\\aihub-build')
  process.exit(1)
}

mkdirSync(targetDir, { recursive: true })
if (needsCopy) {
  rmSync(targetDir, { recursive: true, force: true })
  mkdirSync(targetDir, { recursive: true })
}

run('npx', ['electron-builder', '--win', 'nsis', 'portable', `--config.directories.output=${targetDir}`])

if (needsCopy) {
  mkdirSync(release, { recursive: true })
  for (const name of readdirSync(release)) {
    if (name.endsWith('.exe') || name.endsWith('.blockmap') || name === 'latest.yml') {
      rmSync(join(release, name), { force: true })
    }
  }
  for (const name of readdirSync(targetDir)) {
    if (name.endsWith('.exe') || name.endsWith('.blockmap') || name === 'latest.yml') {
      copyFileSync(join(targetDir, name), join(release, name))
    }
  }
  rmSync(targetDir, { recursive: true, force: true })
  console.log(`产物已复制到：${release}`)
}

// NSIS 安装器从含中文的路径启动时会报 "Error writing temporary file"。
// 默认只写入项目 release/；如需额外的 ASCII 发布目录，必须显式设置
// AIHUB_PUBLISH_DIR，绝不在 C 盘自动创建测试/发布目录。
const publishDir = process.env.AIHUB_PUBLISH_DIR
if (publishDir) {
  try {
    mkdirSync(publishDir, { recursive: true })
    const names = readdirSync(release).filter(
      (name) => name.endsWith('.exe') || name.endsWith('.blockmap') || name === 'latest.yml'
    )
    for (const name of names) copyFileSync(join(release, name), join(publishDir, name))
    console.log(`额外发布目录：${publishDir}`)
  } catch (error) {
    console.warn(`无法复制到发布目录 ${publishDir}: ${error.message}`)
  }
}

