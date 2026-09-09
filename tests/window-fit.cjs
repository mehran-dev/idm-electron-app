const { test } = require('node:test')
const assert = require('node:assert/strict')
const load = require('./load-typescript.cjs')
const { centeredContentBounds } = load('src/main/presentation/window-fit.ts')

test('content resizing preserves the window center', () => {
  const area = { x: 100, y: 40, width: 1200, height: 800 }
  assert.deepEqual(
    { ...centeredContentBounds({ x: 400, y: 300, width: 600, height: 200 }, area, 400) },
    { x: 400, y: 200, width: 600, height: 400 },
  )
})

test('centered content bounds stay inside offset work areas', () => {
  assert.deepEqual(
    {
      ...centeredContentBounds(
        { x: 110, y: 50, width: 700, height: 300 },
        { x: 100, y: 40, width: 500, height: 400 },
        900,
      ),
    },
    { x: 100, y: 40, width: 500, height: 400 },
  )
})
