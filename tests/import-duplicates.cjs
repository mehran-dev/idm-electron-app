const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const load = require('./load-typescript.cjs')
const { DownloadService } = load('src/main/application/download-service.ts')
const { InMemoryDownloadRepository } = load(
  'src/main/infrastructure/in-memory-download-repository.ts',
)
const { downloadDestination } = load('src/main/infrastructure/download-destination.ts')

test('import prompts for filenames on disk and within the batch; skip and show preserve originals', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'import-duplicates-'))
  try {
    const target = path.join(dir, 'file.zip')
    fs.writeFileSync(target, 'keep this')
    const list = path.join(dir, 'list.txt')
    fs.writeFileSync(
      list,
      [
        'https://example.test/a/file.zip',
        'https://example.test/b/file.zip',
        'https://example.test/c/file.zip',
        'https://example.test/d/file.zip',
      ].join('\n'),
    )
    const repo = new InMemoryDownloadRepository()
    const service = new DownloadService(repo, {}, () => {}, downloadDestination, dir)
    const choices = [0, 0, 2, 1]
    const prompts = []
    const shown = []
    const handlers = {}
    const electron = {
      BrowserWindow: { fromWebContents: () => undefined },
      ipcMain: {
        handle: (channel, handler) => {
          handlers[channel] = handler
        },
      },
      dialog: {
        showOpenDialog: async () => ({ canceled: false, filePaths: [list] }),
        showMessageBox: async (options) => {
          prompts.push(options)
          return { response: choices.shift() }
        },
      },
      shell: { showItemInFolder: (file) => shown.push(file) },
    }
    const submit = load('src/main/presentation/ipc/download-submit.ts', { electron })
    const { registerDownloadHandlers } = load('src/main/presentation/ipc/download-handlers.ts', {
      electron,
      './download-submit': submit,
      '../../../shared/download': { IPC: new Proxy({}, { get: (_, key) => key }) },
    })
    registerDownloadHandlers(service, (id) => shown.push(id))
    const result = await handlers.importList({ sender: {} }, 'main')
    assert.equal(result.imported, 2)
    assert.equal(result.skipped, 2)
    assert.equal(prompts.length, 4)
    assert.match(prompts[0].detail, /file \(1\).zip/)
    assert.match(prompts[1].detail, /file \(2\).zip/)
    assert.equal(
      service
        .list()
        .map((item) => item.fileName)
        .sort()
        .join(','),
      'file (1).zip,file (2).zip',
    )
    assert.equal(fs.readFileSync(target, 'utf8'), 'keep this')
    assert.equal(shown[0], target)
    assert.equal(fs.readdirSync(dir).sort().join(','), 'file.zip,list.txt')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
