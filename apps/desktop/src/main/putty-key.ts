import { createCipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import ssh2 from 'ssh2';
import sshpk from 'sshpk';

function sshString(value: Buffer | string): Buffer {
  const bytes = typeof value === 'string' ? Buffer.from(value, 'utf8') : value;
  const length = Buffer.alloc(4); length.writeUInt32BE(bytes.length);
  return Buffer.concat([length, bytes]);
}
function mpint(value: Buffer): Buffer {
  let start = 0;
  while (start < value.length - 1 && value[start] === 0) start++;
  const bytes = value.subarray(start);
  return sshString(bytes[0]! & 0x80 ? Buffer.concat([Buffer.from([0]), bytes]) : bytes);
}
function lines(label: string, blob: Buffer): string {
  const chunks = blob.toString('base64').match(/.{1,64}/g) ?? [];
  return `${label}: ${chunks.length}\n${chunks.join('\n')}\n`;
}

/** PuTTY v2: interoperable RSA, ECDSA and Ed25519, with optional AES encryption. */
export function toPuttyPrivateKey(material: string, passphrase = '', comment = '', outputPassphrase = passphrase): string {
  const parsed = ssh2.utils.parseKey(material, passphrase || undefined);
  if (parsed instanceof Error) throw new Error(`Cannot read private key: ${parsed.message}`);
  const key = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!key?.isPrivateKey()) throw new Error('A private key is required.');
  const privateKey = sshpk.parsePrivateKey(key.getPrivatePEM(), 'pem');
  const part = (name: string) => {
    const found = privateKey.parts.find((entry) => entry.name === name);
    if (!found) throw new Error(`Unsupported private key component: ${name}`);
    return found.data;
  };
  const publicBlob = key.getPublicSSH();
  let privateBlob: Buffer;
  if (key.type === 'ssh-rsa') privateBlob = Buffer.concat(['d', 'p', 'q', 'iqmp'].map((name) => mpint(part(name))));
  else if (key.type.startsWith('ecdsa-sha2-')) privateBlob = mpint(part('d'));
  else if (key.type === 'ssh-ed25519') privateBlob = sshString(part('k').subarray(0, 32));
  else throw new Error('PuTTY export supports RSA, ECDSA and Ed25519 keys.');
  const encryption = outputPassphrase ? 'aes256-cbc' : 'none';
  let storedBlob = privateBlob;
  if (outputPassphrase) {
    const padding = (16 - privateBlob.length % 16) % 16;
    privateBlob = Buffer.concat([privateBlob, randomBytes(padding)]);
    const digest = (counter: number) => {
      const prefix = Buffer.alloc(4); prefix.writeUInt32BE(counter);
      return createHash('sha1').update(prefix).update(outputPassphrase, 'utf8').digest();
    };
    const cipher = createCipheriv('aes-256-cbc', Buffer.concat([digest(0), digest(1)]).subarray(0, 32), Buffer.alloc(16));
    cipher.setAutoPadding(false);
    storedBlob = Buffer.concat([cipher.update(privateBlob), cipher.final()]);
  }
  const safeComment = comment.replace(/[\r\n\0]/g, ' ');
  const macKey = createHash('sha1').update('putty-private-key-file-mac-key').update(outputPassphrase, 'utf8').digest();
  const mac = createHmac('sha1', macKey).update(Buffer.concat([sshString(key.type), sshString(encryption), sshString(safeComment), sshString(publicBlob), sshString(privateBlob)])).digest('hex');
  return `PuTTY-User-Key-File-2: ${key.type}\nEncryption: ${encryption}\nComment: ${safeComment}\n${lines('Public-Lines', publicBlob)}${lines('Private-Lines', storedBlob)}Private-MAC: ${mac}\n`;
}
