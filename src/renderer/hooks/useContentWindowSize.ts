import { useEffect } from 'react'

/** Keep finite forms at their natural height; lists retain user-sized viewports. */
export function useContentWindowSize() {
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (
      (!params.has('utilityDialog') && !params.has('listDialog') && !params.has('progress')) ||
      params.get('utilityDialog') === 'social-history'
    )
      return
    const root = document.getElementById('root')!
    document.body.classList.add('content-sized-window')
    let frame = 0
    let previousHeight = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const height = Math.ceil(root.getBoundingClientRect().height)
        if (height > 0 && height !== previousHeight) {
          previousHeight = height
          void window.downloads.fitWindow(height).catch(() => {
            previousHeight = 0
          })
        }
      })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    measure()
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      document.body.classList.remove('content-sized-window')
    }
  }, [])
}
