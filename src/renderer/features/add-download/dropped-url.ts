const firstHttpUrl = (value: string) => {
  for (const line of value.split(/\r?\n/)) {
    const candidate = line.trim()
    if (!candidate || candidate.startsWith('#')) continue
    try {
      const parsed = new URL(candidate)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href
    } catch {
      // Try the next representation supplied by the browser.
    }
  }
}

export function droppedDownloadUrl(data: { uriList?: string; plainText?: string; html?: string }) {
  const direct = firstHttpUrl(data.uriList ?? '') ?? firstHttpUrl(data.plainText ?? '')
  if (direct) return direct
  const href = data.html?.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1]
  return href ? firstHttpUrl(href.replaceAll('&amp;', '&')) : undefined
}
