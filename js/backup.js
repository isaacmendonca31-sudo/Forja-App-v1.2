/**
 * FORJA — Exportação e importação de backups.
 *
 * Formato: JSON { app:'forja', format:1, exportedAt, data:{…} }.
 * Opcionalmente protegido por senha (criptografia autenticada):
 *   senha → PBKDF2-SHA256 (600.000 iterações, salt aleatório de 16 bytes)
 *         → chave AES-256-GCM, IV aleatório de 12 bytes.
 * Tudo com a Web Crypto API nativa (sem bibliotecas de terceiros).
 */
import { FORMAT_VERSION, LIMITS } from './validate.js';
import { bytesToB64, b64ToBytes } from './utils.js';

const PBKDF2_ITERATIONS = 600_000;
// Limites aceitos ao LER um arquivo: impedem que um arquivo malicioso force
// um número absurdo de iterações (negação de serviço no aparelho).
const MIN_ITER = 100_000;
const MAX_ITER = 2_000_000;

/** Monta o objeto de backup (sem lápides de itens excluídos). */
export function buildBackup(state) {
  return {
    app: 'forja',
    format: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      plan: state.plan,
      settings: state.settings,
      customExercises: state.customExercises.filter((e) => !e.deletedAt),
      sessions: state.sessions.filter((s) => !s.deletedAt),
    },
  };
}

async function deriveKey(passphrase, salt, iterations) {
  const material = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Criptografa o backup com uma senha. */
export async function encryptBackup(backup, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
  const plain = new TextEncoder().encode(JSON.stringify(backup));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  return {
    app: 'forja',
    format: FORMAT_VERSION,
    encrypted: true,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS, salt: bytesToB64(salt) },
    cipher: { name: 'AES-GCM', iv: bytesToB64(iv), data: bytesToB64(cipher) },
  };
}

export const isEncryptedBackup = (o) => o && o.app === 'forja' && o.encrypted === true;

/** Descriptografa um backup. Lança erro genérico se a senha estiver errada. */
export async function decryptBackup(envelope, passphrase) {
  try {
    const { kdf, cipher } = envelope;
    if (kdf?.name !== 'PBKDF2' || kdf.hash !== 'SHA-256' || cipher?.name !== 'AES-GCM') throw new Error('formato');
    const iterations = Number(kdf.iterations);
    if (!Number.isInteger(iterations) || iterations < MIN_ITER || iterations > MAX_ITER) throw new Error('iterações');
    const salt = b64ToBytes(kdf.salt);
    const iv = b64ToBytes(cipher.iv);
    if (salt.length !== 16 || iv.length !== 12) throw new Error('parâmetros');
    const key = await deriveKey(passphrase, salt, iterations);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, b64ToBytes(cipher.data));
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    throw new Error('Senha incorreta ou arquivo corrompido.');
  }
}

/** Baixa um objeto como arquivo .json. */
export function downloadJSON(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Lê e faz o parse de um arquivo escolhido pelo usuário (com limite de tamanho). */
export async function readBackupFile(file) {
  if (!file) throw new Error('Nenhum arquivo selecionado.');
  if (file.size > LIMITS.maxBackupBytes) throw new Error('Arquivo muito grande (limite de 5 MB).');
  const text = await file.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('O arquivo não é um JSON válido.');
  }
}
