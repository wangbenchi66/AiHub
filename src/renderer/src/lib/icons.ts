const modules = import.meta.glob('../assets/providers/*.svg', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>

export function providerIcon(file: string): string | undefined {
  if (!file) return undefined
  return modules[`../assets/providers/${file}`]
}

const MONO_ICONS = new Set([
  'chatgpt.svg',
  'grok.svg',
  'kimi.svg',
  'poe.svg',
  'notebooklm.svg',
  'coze.svg',
  'githubcopilot.svg',
  'phind.svg',
  'lambda.svg',
  'youmind.svg'
])

export function isMonoIcon(file: string): boolean {
  return MONO_ICONS.has(file)
}
