const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const load = require('./load-typescript.cjs')
const { downloadDestination } = load('src/main/infrastructure/download-destination.ts')
const { DownloadService } = load('src/main/application/download-service.ts')

test('new copies reserve queued names and preserve existing files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duplicate-download-'))
  try {
    const target = path.join(dir, 'report.zip')
    fs.writeFileSync(target, 'original')
    const items = []
    const service = new DownloadService(
      {
        allQueues: () => [{ id: 'main' }],
        getQueue: () => ({ id: 'main' }),
        all: () => items,
        get: (id) => items.find((item) => item.id === id),
        getSegmentCount: () => 4,
        save: (item) => {
          if (!items.includes(item)) items.push(item)
        },
      },
      { start: () => assert.fail('completed downloads must not restart') },
      () => {},
      downloadDestination,
      dir,
    )
    const first = service.enqueue('https://example.test/report.zip', 'main', 4, target)
    const second = service.enqueue('https://example.test/report.zip')
    assert.equal(first.fileName, 'report (1).zip')
    assert.equal(second.fileName, 'report (2).zip')
    assert.equal(fs.readFileSync(target, 'utf8'), 'original')
    assert.equal(service.findDuplicate('https://example.test/report.zip#section').id, first.id)
    assert.equal(service.findDuplicate('https://example.test/report.zip?different=1'), undefined)
    first.status = 'completed'
    service.resume(first.id)
    assert.throws(() => service.enqueue('https://example.test/file', 'main', 4, 'relative.zip'))
    assert.equal(items.length, 2)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
