const { test } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const source = ts.transpileModule(
  fs.readFileSync('src/main/infrastructure/electron-download-engine.ts', 'utf8'),
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  },
).outputText
const exportsObject = {}
vm.runInNewContext(source, {
  exports: exportsObject,
  console,
  setTimeout,
  Buffer,
  require(name) {
    if (name === 'electron')
      return {
        app: { getPath: () => os.tmpdir() },
        net: { request: ({ url, method }) => http.request(url, { method }) },
      }
    return require(name)
  },
})
for (const mode of ['ranges', 'tiny', 'ignored', 'parallel-ignored', 'probe-error']) {
  test(mode, { timeout: 5000 }, async () => {
    const body = Buffer.from(
      Array.from({ length: mode === 'tiny' ? 10 : 10000 }, (_, i) => i % 251),
    )
    const requests = []
    const server = http.createServer((req, res) => {
      const range = req.headers.range
      requests.push(range)
      if (mode === 'probe-error') {
        res.writeHead(403)
        res.end('denied')
        return
      }
      if (mode === 'ignored' || (mode === 'parallel-ignored' && range !== 'bytes=0-0')) {
        res.writeHead(200, { 'Content-Length': body.length })
        res.end(body)
        return
      }
      const match = /^bytes=(\d+)-(\d+)$/.exec(range || '')
      assert.ok(match)
      const start = Number(match[1]),
        end = Number(match[2])
      assert.ok(start <= end && end < body.length)
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${body.length}`,
        'Content-Length': end - start + 1,
      })
      res.end(body.subarray(start, end + 1))
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'range-test-'))
    const item = {
      id: 'test',
      url: `http://127.0.0.1:${server.address().port}/file`,
      fileName: 'file',
      savePath: path.join(dir, 'file'),
      segmentCount: mode === 'tiny' ? 8 : 4,
    }
    try {
      let finish
      const finished = new Promise((resolve) => {
        finish = resolve
      })
      const engine = new exportsObject.ElectronDownloadEngine(
        {},
        { get: () => item, save: () => {} },
        () => {},
        finish,
      )
      await engine.start(item.id, item.url, item.fileName)
      await finished
      if (mode === 'probe-error') {
        assert.equal(item.status, 'failed')
        assert.equal(fs.existsSync(item.savePath), false)
      } else {
        assert.equal(item.status, 'completed')
        assert.deepEqual(fs.readFileSync(item.savePath), body)
        assert.equal(item.segmentProgress.length, mode.includes('ignored') ? 1 : item.segmentCount)
        if (mode.includes('ignored')) assert.match(item.connectionInfo, /one connection/)
        else assert.equal(requests.length, item.segmentCount + 1)
      }
    } finally {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
}
