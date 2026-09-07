const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { runInNewContext } = require('node:vm')
const ts = require('typescript')
const exportsUnderTest = {}
runInNewContext(
  ts.transpileModule(readFileSync('src/main/infrastructure/youtube-session.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  { exports: exportsUnderTest, require: (name) => (name === 'electron' ? {} : require(name)) },
)
const cookie = {
  domain: '.youtube.com',
  path: '/',
  name: 'SID',
  value: 'test-only',
  secure: true,
  httpOnly: true,
  session: false,
  expirationDate: 2000000000.8,
}
test('exports YouTube cookies in Netscape format, including HttpOnly and session expiry', () => {
  assert.equal(
    exportsUnderTest.youtubeCookiesText([cookie]),
    '# Netscape HTTP Cookie File\n#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t2000000000\tSID\ttest-only\n',
  )
  assert.match(
    exportsUnderTest.youtubeCookiesText([{ ...cookie, domain: 'www.youtube.com', session: true }]),
    /FALSE\t\/\tTRUE\t0\tSID/,
  )
})
test('excludes unrelated domains and line injection', () => {
  const result = exportsUnderTest.youtubeCookiesText([
    { ...cookie, domain: '.google.com' },
    { ...cookie, domain: 'evilyoutube.com' },
    { ...cookie, domain: undefined },
    { ...cookie, value: 'bad\nline' },
  ])
  assert.equal(result, '# Netscape HTTP Cookie File\n\n')
})
