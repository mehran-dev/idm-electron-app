const { test } = require('node:test')
const assert = require('node:assert/strict')
const { mkdtemp, readFile, writeFile, rm } = require('node:fs/promises')
const { readFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { runInNewContext } = require('node:vm')
const ts = require('typescript')
const moduleExports = {}
runInNewContext(
  ts.transpileModule(readFileSync('src/main/infrastructure/social-download-history.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  { exports: moduleExports, require },
)
const { SocialDownloadHistory } = moduleExports
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'social-history-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return join(directory, 'history.json')
}
test('retains completed paths and failed attempts after reopening', async (t) => {
  const path = await fixture(t)
  const history = new SocialDownloadHistory(path)
  const complete = await history.start('youtube', 'https://www.youtube.com/watch?v=example')
  const failed = await history.start('instagram', 'https://www.instagram.com/reel/example/')
  await history.finish(complete, 'completed', '/tmp/example.mp4')
  await history.finish(failed, 'failed')
  const reopened = await new SocialDownloadHistory(path).list()
  assert.equal(reopened.length, 2)
  assert.equal(reopened.find((r) => r.id === complete).filePath, '/tmp/example.mp4')
  assert.equal(reopened.find((r) => r.id === complete).status, 'completed')
  assert.equal(reopened.find((r) => r.id === failed).status, 'failed')
})
test('recovers active attempts as interrupted and persists recovery', async (t) => {
  const path = await fixture(t)
  const history = new SocialDownloadHistory(path)
  await history.start('youtube', 'https://youtu.be/example')
  const reopened = await new SocialDownloadHistory(path).list()
  assert.equal(reopened[0].status, 'interrupted')
  assert.equal(JSON.parse(await readFile(path, 'utf8')).records[0].status, 'interrupted')
})
test('serializes concurrent attempts without losing records', async (t) => {
  const path = await fixture(t)
  const history = new SocialDownloadHistory(path)
  const ids = await Promise.all(
    Array.from({ length: 12 }, () => history.start('youtube', 'https://youtu.be/example')),
  )
  await Promise.all(ids.map((id) => history.finish(id, 'interrupted')))
  const records = JSON.parse(await readFile(path, 'utf8')).records
  assert.equal(new Set(records.map((r) => r.id)).size, 12)
  assert.ok(records.every((r) => r.status === 'interrupted'))
})
test('does not overwrite corrupt history with a new empty list', async (t) => {
  const path = await fixture(t)
  await writeFile(path, 'broken-json')
  const history = new SocialDownloadHistory(path)
  await assert.rejects(history.list())
  await assert.rejects(history.start('youtube', 'https://youtu.be/example'))
  assert.equal(await readFile(path, 'utf8'), 'broken-json')
})
