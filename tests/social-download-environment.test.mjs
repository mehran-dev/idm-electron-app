import test from 'node:test'
import assert from 'node:assert/strict'
import {
  socialDownloadEnvironment,
  hasCertificateError,
} from '../src/main/infrastructure/social-download-environment.ts'

test('uses installed Linux CA bundle without changing parent environment', () => {
  const source = { HTTPS_PROXY: 'http://localhost:8080' }
  const result = socialDownloadEnvironment(
    source,
    'linux',
    (path) => path === '/etc/ssl/certs/ca-certificates.crt',
  )
  assert.equal(result.SSL_CERT_FILE, '/etc/ssl/certs/ca-certificates.crt')
  assert.equal(result.HTTPS_PROXY, source.HTTPS_PROXY)
  assert.equal(result.ELECTRON_RUN_AS_NODE, '1')
  assert.equal(source.SSL_CERT_FILE, undefined)
})
test('preserves explicit trust settings and non-Linux defaults', () => {
  for (const source of [{ SSL_CERT_FILE: '/custom.pem' }, { SSL_CERT_DIR: '/custom' }]) {
    const result = socialDownloadEnvironment(source, 'linux', () => true)
    assert.equal(result.SSL_CERT_FILE, source.SSL_CERT_FILE)
    assert.equal(result.SSL_CERT_DIR, source.SSL_CERT_DIR)
  }
  assert.equal(socialDownloadEnvironment({}, 'win32', () => true).SSL_CERT_FILE, undefined)
  assert.equal(socialDownloadEnvironment({}, 'linux', () => false).SSL_CERT_FILE, undefined)
})
test('retains certificate diagnosis when the final error is a connection reset', () => {
  assert.equal(
    hasCertificateError(
      'WARNING: [SSL: CERTIFICATE_VERIFY_FAILED]\nERROR: Connection reset by peer',
    ),
    true,
  )
  assert.equal(hasCertificateError('unable to get local issuer certificate'), true)
  assert.equal(hasCertificateError('Connection reset by peer'), false)
})
