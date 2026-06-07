import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import forge from 'node-forge';
const pki = forge.pki;

const __dirname = dirname(fileURLToPath(import.meta.url));
const CERT_DIR = join(__dirname, '..', '.certs');
const KEY_PATH = join(CERT_DIR, 'key.pem');
const CERT_PATH = join(CERT_DIR, 'cert.pem');

export function generateCert(): { key: string; cert: string } {
  const keys = pki.rsa.generateKeyPair(2048);
  const cert = pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = Date.now().toString(16);
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  const attrs = [{ name: 'commonName', value: 'localhost' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);

  cert.setExtensions([
    { name: 'basicConstraints', cA: true },
    { name: 'keyUsage', keyCertSign: true, digitalSignature: true },
    { name: 'subjectAltName', altNames: [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }] },
  ]);

  cert.sign(keys.privateKey);

  const keyPem = pki.privateKeyToPem(keys.privateKey);
  const certPem = pki.certificateToPem(cert);

  if (!existsSync(CERT_DIR)) mkdirSync(CERT_DIR, { recursive: true });
  writeFileSync(KEY_PATH, keyPem);
  writeFileSync(CERT_PATH, certPem);

  return { key: keyPem, cert: certPem };
}

if (!existsSync(CERT_PATH)) {
  generateCert();
  console.log(`[SKYNET] Certificates generated at ${CERT_DIR}`);
} else {
  console.log(`[SKYNET] Certificates already exist at ${CERT_DIR}`);
}
