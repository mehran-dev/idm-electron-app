import { existsSync } from 'node:fs'
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path'

export function downloadDestination(path: string, reserved: string[]) {
  if (!isAbsolute(path) || !basename(path) || path.endsWith('/') || path.endsWith('\\'))
    throw new Error('Choose an absolute file path, including a file name.')
  const original = resolve(path)
  const occupied = new Set(reserved.filter(Boolean).map((value) => resolve(value)))
  const extension = extname(original)
  const stem = basename(original, extension).replace(/ \(\d+\)$/, '')
  let candidate = original
  let number = 1
  while (occupied.has(candidate) || existsSync(candidate))
    candidate = join(dirname(original), `${stem} (${number++})${extension}`)
  return candidate
}
