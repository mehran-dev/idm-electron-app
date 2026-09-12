const { test } = require('node:test')
const assert = require('node:assert/strict')
const { mkdtemp, readFile, rm, stat } = require('node:fs/promises')
const { readFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { runInNewContext } = require('node:vm')
const ts = require('typescript')
const moduleExports = {}
runInNewContext(
  ts.transpileModule(readFileSync('src/main/infrastructure/youtube-auth.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  { exports: moduleExports, require, console },
)
const { YouTubeAuthStore, youtubeOnlyCookieText } = moduleExports

test('manual cookie import retains only YouTube cookie rows', () => {
  const input = [
    '# Netscape HTTP Cookie File',
    '.youtube.com\tTRUE\t/\tTRUE\t0\tSID\tyoutube-secret',
    '.google.com\tTRUE\t/\tTRUE\t0\tSID\tgmail-secret',
    '#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t0\tLOGIN_INFO\tlogin-secret',
  ].join('\n')
  const result = youtubeOnlyCookieText(input)
  assert.match(result, /youtube-secret/)
  assert.match(result, /login-secret/)
  assert.doesNotMatch(result, /gmail-secret|\.google\.com/)
})

test('rejects manual text without valid YouTube cookies', () => {
  assert.throws(() => youtubeOnlyCookieText('SID=not-a-cookie-file'), /Netscape/)
  assert.throws(
    () =>
      youtubeOnlyCookieText(
        '# Netscape HTTP Cookie File\n.google.com\tTRUE\t/\tTRUE\t0\tSID\tsecret',
      ),
    /No YouTube cookies/,
  )
})

test('persists explicit auth source without storing browser cookies', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'youtube-auth-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const config = join(directory, 'auth.json')
  const cookies = join(directory, 'cookies.txt')
  const auth = new YouTubeAuthStore(config, cookies)
  await auth.useBrowser('firefox')
  assert.deepEqual(Array.from(await auth.downloaderArgs()), ['--cookies-from-browser', 'firefox'])
  assert.equal((await auth.status(false)).label, 'Firefox selected')
  assert.doesNotMatch(await readFile(config, 'utf8'), /cookie|secret/i)
  assert.equal((await stat(config)).mode & 0o777, 0o600)

  await auth.saveCookies('# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t0\tSID\tsecret')
  assert.deepEqual(Array.from(await auth.downloaderArgs()), ['--cookies', cookies])
  assert.equal((await auth.status(false)).mode, 'manual')
  assert.equal((await stat(cookies)).mode & 0o777, 0o600)
  await rm(cookies)
  assert.equal((await auth.status(false)).mode, 'none')
  assert.deepEqual(Array.from(await auth.downloaderArgs()), [])
  await auth.clear()
  assert.deepEqual(Array.from(await auth.downloaderArgs()), [])
})
