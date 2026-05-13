import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadMd } from '@/features/tasks/lib/downloadMd'

describe('downloadMd', () => {
  const createObjectURL = vi.fn<(blob: Blob) => string>()
  const revokeObjectURL = vi.fn<(url: string) => void>()
  const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

  afterEach(() => {
    createObjectURL.mockReset()
    revokeObjectURL.mockReset()
    clickSpy.mockClear()
    vi.unstubAllGlobals()
  })

  it('creates a markdown blob and downloads it with the file basename', async () => {
    createObjectURL.mockImplementation(() => 'blob:task-detail')
    revokeObjectURL.mockImplementation(() => {})

    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    })

    downloadMd('docs/guides/getting-started.md', '# Hello')

    expect(clickSpy).toHaveBeenCalledOnce()
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:task-detail')
    const markdownBlob = createObjectURL.mock.calls[0]?.[0]
    if (!(markdownBlob instanceof Blob)) {
      throw new Error('Expected markdown blob to be captured')
    }
    const content = new TextDecoder().decode(await markdownBlob.arrayBuffer())
    expect(content).toBe('# Hello')
  })
})
