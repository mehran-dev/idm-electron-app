export interface Rectangle {
  x: number
  y: number
  width: number
  height: number
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(value, maximum))

/** Resize around the existing center, then constrain the complete window to the work area. */
export function centeredContentBounds(
  current: Rectangle,
  workArea: Rectangle,
  requestedHeight: number,
): Rectangle {
  const width = Math.min(current.width, workArea.width)
  const height = Math.min(workArea.height, Math.max(120, Math.ceil(requestedHeight)))
  const centerX = current.x + current.width / 2
  const centerY = current.y + current.height / 2
  return {
    width,
    height,
    x: Math.round(clamp(centerX - width / 2, workArea.x, workArea.x + workArea.width - width)),
    y: Math.round(clamp(centerY - height / 2, workArea.y, workArea.y + workArea.height - height)),
  }
}
