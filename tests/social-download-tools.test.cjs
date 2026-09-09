const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { runInNewContext } = require('node:vm')
const test = require('node:test')
const ts = require('typescript')

const moduleExports = {}
runInNewContext(
  ts.transpileModule(readFileSync('src/main/infrastructure/social-download-tools.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  { exports: moduleExports, require, process },
)
const { resolveSocialDownloadTools } = moduleExports

const normalize = (value) => (typeof value === 'string' ? value.replaceAll('\\', '/') : value)
const resolver = (platform, files, env = {}, arch = 'x64') => {
  const result = resolveSocialDownloadTools({
    appPath: '/app',
    resourcesPath: '/resources',
    platform,
    arch,
    env,
    exists: (path) => files.includes(normalize(path)),
  })
  return {
    ...result,
    downloader: normalize(result.downloader),
    ffmpegDirectory: normalize(result.ffmpegDirectory),
  }
}

test('resolves the bundled Windows executable from the flat compatibility directory', () => {
  assert.deepEqual(resolver('win32', ['/app/vendor/yt-dlp.exe']), {
    downloader: '/app/vendor/yt-dlp.exe',
    ffmpegDirectory: undefined,
    hasFfmpeg: false,
  })
})

test('prefers platform and architecture-specific packaged tools', () => {
  assert.deepEqual(
    resolver(
      'darwin',
      ['/resources/vendor/darwin-arm64/yt-dlp', '/resources/vendor/darwin-arm64/ffmpeg'],
      {},
      'arm64',
    ),
    {
      downloader: '/resources/vendor/darwin-arm64/yt-dlp',
      ffmpegDirectory: '/resources/vendor/darwin-arm64',
      hasFfmpeg: true,
    },
  )
})

test('does not attempt to run legacy Linux binaries on macOS', () => {
  assert.deepEqual(resolver('darwin', ['/app/vendor/yt-dlp', '/app/vendor/ffmpeg']), {
    downloader: 'yt-dlp',
    ffmpegDirectory: undefined,
    hasFfmpeg: false,
  })
})

test('uses a universal macOS vendor executable for either architecture', () => {
  for (const arch of ['x64', 'arm64']) {
    assert.equal(
      resolver('darwin', ['/app/vendor/darwin/yt-dlp'], {}, arch).downloader,
      '/app/vendor/darwin/yt-dlp',
    )
  }
})

test('supports explicit system-managed tool locations', () => {
  assert.deepEqual(
    resolver('linux', ['/custom/yt-dlp', '/custom/ffmpeg'], {
      NEXUS_YT_DLP_PATH: '/custom/yt-dlp',
      NEXUS_FFMPEG_PATH: '/custom/ffmpeg',
    }),
    {
      downloader: '/custom/yt-dlp',
      ffmpegDirectory: '/custom/ffmpeg',
      hasFfmpeg: true,
    },
  )
})
