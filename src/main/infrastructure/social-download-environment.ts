import { existsSync } from 'node:fs'

export function socialDownloadEnvironment(
  source: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
  exists: (path: string) => boolean = existsSync,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...source, PYTHONUNBUFFERED: '1', ELECTRON_RUN_AS_NODE: '1' }
  // Bundled Python may use build-machine OpenSSL paths. Point it at the
  // installed trust store, preserving explicitly configured trust settings.
  if (platform === 'linux' && !env.SSL_CERT_FILE && !env.SSL_CERT_DIR) {
    const bundle = [
      '/etc/ssl/certs/ca-certificates.crt',
      '/etc/pki/tls/certs/ca-bundle.crt',
      '/etc/ssl/ca-bundle.pem',
      '/etc/ssl/cert.pem',
    ].find(exists)
    if (bundle) env.SSL_CERT_FILE = bundle
  }
  return env
}

export function hasCertificateError(output: string): boolean {
  return /certificate[ _]verify[ _]failed|unable to get local issuer certificate/i.test(output)
}
