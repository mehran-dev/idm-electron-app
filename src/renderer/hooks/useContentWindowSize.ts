import { useLayoutEffect } from 'react'

/** Keep finite forms at their natural height; lists retain user-sized viewports. */
export function useContentWindowSize() {
  useLayoutEffect(() => {
    const params = new URLSearchParams(location.search)
    if (
      (!params.has('utilityDialog') && !params.has('listDialog') && !params.has('progress')) ||
      params.get('utilityDialog') === 'social-history'
    )
      return
    const root = document.getElementById('root')!
    document.body.classList.add('content-sized-window', 'content-window-sizing')
    let frame = 0
    let previousHeight = 0
    const contentHeight = () => Math.ceil(root.getBoundingClientRect().height)
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (root.querySelector('[data-content-ready="false"]')) return
        // Measure the laid-out content rather than scrollHeight. Scrollable
        // overflow can include focus outlines, so losing window focus must not
        // be mistaken for the dialog becoming shorter.
        const height = contentHeight()
        if (height > 0 && height !== previousHeight) {
          previousHeight = height
          void window.downloads
            .fitWindow(height)
            .then(({ clamped }) => {
              document.body.classList.toggle('content-window-clamped', clamped)
            })
            .catch(() => {
              previousHeight = 0
            })
            .finally(() => {
              document.body.classList.remove('content-window-sizing')
            })
        }
      })
    }
    const observer = new ResizeObserver(() => {
      if (!root.querySelector('[data-content-ready="false"]') && contentHeight() !== previousHeight)
        document.body.classList.add('content-window-sizing')
      measure()
    })
    const contentObserver = new MutationObserver(measure)
    observer.observe(root)
    contentObserver.observe(root, { attributes: true, childList: true, subtree: true })
    measure()
    return () => {
      observer.disconnect()
      contentObserver.disconnect()
      cancelAnimationFrame(frame)
      document.body.classList.remove(
        'content-sized-window',
        'content-window-sizing',
        'content-window-clamped',
      )
    }
  }, [])
}
