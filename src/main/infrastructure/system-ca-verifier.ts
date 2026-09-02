import { X509Certificate } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import type { Session } from 'electron'

const systemBundles = ['/etc/ssl/certs/ca-certificates.crt', '/etc/pki/tls/certs/ca-bundle.crt']

function loadSystemAuthorities(): X509Certificate[] {
  const bundle = systemBundles.find(existsSync)
  if (!bundle) return []
  const pem = readFileSync(bundle, 'utf8')
  return (
    pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g)?.flatMap((value) => {
      try {
        return [new X509Certificate(value)]
      } catch {
        return []
      }
    }) ?? []
  )
}

export function useSystemCertificateAuthorities(targetSession: Session): void {
  const authorities = loadSystemAuthorities()
  targetSession.setCertificateVerifyProc((request, callback) => {
    if (request.verificationResult === 'net::OK') {
      callback(-3)
      return
    }
    try {
      const leaf = new X509Certificate(request.certificate.data)
      const now = Date.now()
      const valid = now >= Date.parse(leaf.validFrom) && now <= Date.parse(leaf.validTo)
      const hostMatches = Boolean(leaf.checkHost(request.hostname))
      const trusted =
        valid && hostMatches && authorities.some((authority) => leaf.verify(authority.publicKey))
      if (trusted) {
        console.info('[TLS accepted by operating-system CA]', {
          hostname: request.hostname,
          issuer: leaf.issuer,
        })
        callback(0)
        return
      }
    } catch (error) {
      console.error('[TLS fallback verification failed]', error)
    }
    console.error('[TLS certificate rejected]', {
      hostname: request.hostname,
      error: request.verificationResult,
      issuer: request.certificate.issuerName,
    })
    callback(-3)
  })
}
