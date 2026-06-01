export function downloadMd(filePath: string, content: string) {
  const filename = filePath.split('/').at(-1) || 'translation.md'
  const extension = filename.toLowerCase().split('.').at(-1)
  const mimeType = extension === 'yaml' || extension === 'yml' ? 'text/yaml' : 'text/markdown'
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = filename

  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
