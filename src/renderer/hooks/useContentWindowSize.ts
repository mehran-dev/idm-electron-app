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
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (root.querySelector('[data-content-ready="false"]')) return
        // scrollHeight tracks the complete intrinsic form even after the native
        // window has been clamped to a smaller display work area.
        const height = Math.ceil(root.scrollHeight)
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
      if (
        !root.querySelector('[data-content-ready="false"]') &&
        Math.ceil(root.scrollHeight) !== previousHeight
      )
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
