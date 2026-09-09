const { test } = require('node:test')
const assert = require('node:assert/strict')
const load = require('./load-typescript.cjs')
const { droppedDownloadUrl } = load('src/renderer/features/add-download/dropped-url.ts')

test('extracts browser-dragged HTTP links and rejects unsafe protocols', () => {
  assert.equal(
    droppedDownloadUrl({ uriList: '# Chrome URL\nhttps://example.test/file.zip' }),
    'https://example.test/file.zip',
  )
  assert.equal(
    droppedDownloadUrl({ html: '<a href="https://example.test/file?a=1&amp;b=2">File</a>' }),
    'https://example.test/file?a=1&b=2',
  )
  assert.equal(droppedDownloadUrl({ plainText: 'file:///home/user/private.zip' }), undefined)
  assert.equal(droppedDownloadUrl({ plainText: 'javascript:alert(1)' }), undefined)
})
