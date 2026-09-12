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

export function socialConnectionError(output: string, provider = 'YouTube'): string {
  if (hasCertificateError(output))
    return `The HTTPS certificate could not be verified. If your VPN or proxy inspects HTTPS, enter its proxy address and try again. You can also enable “Allow untrusted certificates” for this lookup, but only when you trust the connection.`
  if (/Connection reset by peer|ECONNRESET/i.test(output))
    return `${provider} reset the connection. Check your VPN or proxy, enter its HTTP/SOCKS address in Connection options, and retry.`
  if (/Connection timed out|connect timeout|timed out|curl: \(28\)/i.test(output))
    return `Connection to ${provider} timed out. Check your internet connection, VPN, or proxy and retry.`
  if (/Network is unreachable|No route to host|Network is down/i.test(output))
    return `${provider} is unreachable. Check your internet connection and VPN or proxy settings.`
  return `${provider} could not be reached. Check the channel or playlist address and your connection settings, then retry.`
}
