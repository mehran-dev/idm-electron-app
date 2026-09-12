const { test } = require('node:test')
const assert = require('node:assert/strict')
const load = require('./load-typescript.cjs')

const { progressActionsFor } = load('src/renderer/features/download-progress/progress-actions.ts')

test('unfinished download states expose specific progress-window actions', () => {
  assert.equal(progressActionsFor('queued').primary.label, 'Start now')
  assert.equal(progressActionsFor('queued').destructive.label, 'Remove from list')
  assert.equal(progressActionsFor('downloading').primary.label, 'Pause')
  assert.equal(progressActionsFor('downloading').destructive.label, 'Cancel download')
  assert.equal(progressActionsFor('paused').primary.label, 'Resume')
  assert.equal(progressActionsFor('interrupted').primary.label, 'Retry')
  assert.equal(progressActionsFor('failed').primary.label, 'Retry')
  assert.equal(progressActionsFor('cancelled').primary.label, 'Restart')
  assert.deepEqual(Object.keys(progressActionsFor('completed')), [])
})
