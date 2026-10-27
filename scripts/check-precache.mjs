// Confere se tudo que o service worker pré-armazena em cache existe,
// e se todo arquivo JS/CSS/ícone do app está na lista (evita "funciona online, quebra offline").
// Uso: node scripts/check-precache.mjs
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const normalizePath = (path) => path.replaceAll('\\', '/');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const block = sw.match(/const SHELL = \[([\s\S]*?)\];/)[1];
const listed = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((p) => p !== './');

let ok = true;
for (const p of listed) {
  if (!existsSync(join(root, p))) { console.error(`✗ listado no sw.js mas não existe: ${p}`); ok = false; }
}

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const full = join(dir, f);
  return statSync(full).isDirectory() ? walk(full) : [full];
});
for (const dir of ['js', 'css', 'icons']) {
  for (const f of walk(join(root, dir))) {
    const rel = normalizePath(relative(root, f));
    if (!listed.includes(rel)) { console.error(`✗ existe mas não está no pré-cache: ${rel}`); ok = false; }
  }
}
const version = sw.match(/const VERSION = '([^']+)'/)[1];
const appVersion = readFileSync(join(root, 'js/version.js'), 'utf8').match(/'([^']+)'/)[1];
if (version !== appVersion) { console.error(`✗ VERSION do sw.js (${version}) difere de js/version.js (${appVersion})`); ok = false; }

console.log(ok ? `✓ pré-cache consistente (${listed.length} arquivos, versão ${version})` : 'Falhou.');
process.exit(ok ? 0 : 1);
