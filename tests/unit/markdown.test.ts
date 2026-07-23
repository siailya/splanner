import { describe, expect, it } from 'vitest'
import { renderSafeMarkdown } from '../../app/utils/markdown'

describe('Markdown preview sanitization', () => {
  it('renders formatting but never executes raw HTML or unsafe links', () => {
    const html = renderSafeMarkdown('# План\n\n**готово**\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))')
    expect(html).toContain('<h1>План</h1>')
    expect(html).toContain('<strong>готово</strong>')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('href="javascript:')
  })
})
