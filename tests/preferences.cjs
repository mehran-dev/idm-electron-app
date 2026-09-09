const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const load = require('./load-typescript.cjs')
const { JsonDownloadRepository } = load('src/main/infrastructure/json-download-repository.ts')

test('completed double-click preference defaults safely and persists', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'download-preferences-'))
  try {
    const file = path.join(dir, 'downloads.json')
    fs.writeFileSync(file, JSON.stringify({ downloads: [], queues: [], settings: {} }))
    const defaults = new JsonDownloadRepository(file)
    assert.equal(defaults.getCompletedDoubleClickAction(), 'open-file')

    defaults.setCompletedDoubleClickAction('show-dialog')
    defaults.flush()
    const restored = new JsonDownloadRepository(file)
    assert.equal(restored.getCompletedDoubleClickAction(), 'show-dialog')

    fs.writeFileSync(
      file,
      JSON.stringify({
        downloads: [],
        queues: [],
        settings: { completedDoubleClickAction: 'unexpected' },
      }),
    )
    const invalid = new JsonDownloadRepository(file)
    assert.equal(invalid.getCompletedDoubleClickAction(), 'open-file')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
