import { marked } from 'marked'

const ALLOWED_TAGS = new Set([
  'P', 'BR', 'STRONG', 'EM', 'S', 'CODE', 'PRE', 'BLOCKQUOTE', 'UL', 'OL', 'LI',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'A', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'HR', 'INPUT',
])

export function renderSafeMarkdown(markdown: string): string {
  const escapedRawHtml = markdown.replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  const rendered = marked.parse(escapedRawHtml, { async: false }) as string
  if (typeof DOMParser === 'undefined') return rendered
  const document = new DOMParser().parseFromString(rendered, 'text/html')
  for (const element of [...document.body.querySelectorAll('*')]) {
    if (!ALLOWED_TAGS.has(element.tagName)) {
      element.replaceWith(document.createTextNode(element.textContent ?? ''))
      continue
    }
    for (const attribute of [...element.attributes]) {
      const allowed = attribute.name === 'href' || (element.tagName === 'INPUT' && ['type', 'checked', 'disabled'].includes(attribute.name))
      if (!allowed) element.removeAttribute(attribute.name)
    }
    if (element.tagName === 'A') {
      const href = element.getAttribute('href') ?? ''
      if (!/^(https?:|mailto:)/i.test(href)) element.removeAttribute('href')
      element.setAttribute('rel', 'noopener noreferrer')
      element.setAttribute('target', '_blank')
    }
    if (element.tagName === 'INPUT') {
      element.setAttribute('disabled', '')
      element.setAttribute('type', 'checkbox')
    }
  }
  return document.body.innerHTML
}
