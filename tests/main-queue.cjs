const { test } = require('node:test')
const assert = require('node:assert/strict')
const load = require('./load-typescript.cjs')
const { DownloadService } = load('src/main/application/download-service.ts')
const { InMemoryDownloadRepository } = load(
  'src/main/infrastructure/in-memory-download-repository.ts',
)
const makeService = (repo) =>
  new DownloadService(
    repo,
    { isActive: () => false },
    () => {},
    (path) => path,
    '/tmp',
  )

for (const custom of [false, true]) {
  test(`Main queue exists and is undeletable with custom queues: ${custom}`, () => {
    const repo = new InMemoryDownloadRepository()
    if (custom)
      repo.saveQueue({ id: 'custom', name: 'Custom', concurrency: 2, createdAt: '2020-01-01' })
    const service = makeService(repo)
    assert.equal(service.listQueues()[0].id, 'main')
    assert.equal(repo.getQueue('main').name, 'Main download queue')
    service.deleteQueue('main')
    assert.ok(repo.getQueue('main'))
    assert.equal(service.enqueue('https://example.test/file').queueId, 'main')
    assert.equal(service.enqueue('https://example.test/file', 'missing').queueId, 'main')
    if (custom) {
      const item = service.enqueue('https://example.test/file', 'custom')
      service.deleteQueue('custom')
      assert.equal(repo.get(item.id).queueId, 'main')
      assert.equal(repo.getQueue('custom'), undefined)
    }
  })
}

test('startup preserves existing Main queue settings', () => {
  const repo = new InMemoryDownloadRepository()
  const main = {
    id: 'main',
    name: 'My main queue',
    concurrency: 3,
    createdAt: '2020-01-01',
    completion: { openFolder: true },
  }
  repo.saveQueue(main)
  makeService(repo)
  assert.deepEqual({ ...repo.getQueue('main') }, main)
  assert.equal(repo.allQueues().length, 1)
})
