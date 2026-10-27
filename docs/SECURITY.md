# Segurança e desenvolvimento seguro

Referências usadas como guia: OWASP ASVS (nível 1, itens aplicáveis a front-end), OWASP Top 10, OWASP MASVS (PWA/armazenamento), LGPD (Lei 13.709/2018). É alinhamento de projeto — **não é certificação nem auditoria independente**.

| Risco | Controle implementado |
|---|---|
| XSS / injeção de HTML | Nenhum `innerHTML`; UI via `h()` (textContent). `h()` bloqueia `html`/`innerHTML`, `on*` só com funções, URLs só `#`/`https`. |
| Scripts de terceiros / supply chain | **Zero dependências** e zero CDN. CSP `script-src 'self'`, `style-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'` (via `_headers`). |
| Dados externos maliciosos (backup, nuvem, localStorage adulterado) | `validate.js`: allow-list de campos, tipos, intervalos, tamanhos; objetos novos (sem poluição de protótipo); ids `^[A-Za-z0-9_-]{1,64}$`; chaves de enum via `hasOwnProperty`. Limites: 5 MB/arquivo, 20k sessões. |
| Backup em claro | Exportação opcional com senha: PBKDF2-SHA256 600k it. + AES-256-GCM (Web Crypto). Ao ler, iterações limitadas (100k–2M) contra DoS. |
| Acesso entre usuários | RLS em `forja_records` (SELECT/INSERT/UPDATE/DELETE por `auth.uid()`), `FORCE RLS`, `anon` sem privilégios, `user_id` imutável por trigger. |
| Chaves | Apenas chave anon (pública). `service_role` nunca no cliente; `.gitignore` e aviso em `config.js`. |
| Autenticação | Login via Supabase Auth; mensagem genérica de erro; bloqueio local de 30 s após 5 falhas (limite real é do servidor); sem cadastro aberto; `credentials: 'omit'`, `referrerPolicy: no-referrer`, `cache: no-store`. Renovação de token; sessão expirada → logout local. |
| Conflitos/perda de dados | LWW por registro (cliente e trigger no servidor), lápides, rascunho do treino, cópia de segurança antes de importar/substituir, cópia de dados corrompidos. |
| Cache do SW | Só GET da mesma origem; requisições à nuvem nunca são cacheadas. Atualização só com ação do usuário. |
| Erros | Mensagens genéricas ao usuário; sem stack/dados em tela. |
| Exclusão de dados | "Apagar dados deste aparelho" e "Excluir dados da nuvem" (confirmação digitada). |

| Dados de teste vazando para dados reais | Chaves separadas (`forja:demo*`), nunca no `state`, em `listRecords`/`dirty` ou no backup; export de teste usa `app:"forja-demo"` (recusado pelo importador); dados lidos do armazenamento são saneados por `sanitizeSession`. Teste automatizado em `tests/demo-store.test.mjs`. |
| Script Python | Lê só arquivo local escolhido, limite de 20 MB, valida tipos/faixas, não executa código do arquivo nem acessa a rede. |

## Limitações conhecidas (transparência)
- Dados em `localStorage` **não são criptografados em repouso**; quem tem acesso desbloqueado ao aparelho/navegador os lê. O token de sessão também fica lá (necessário para uso offline). Mitigação: CSP estrita + ausência de XSS; ativar bloqueio de tela e MFA no Supabase.
- Backup sem senha é texto puro.
- `unsafe-inline` não é usado; o ícone SVG usa `<use>` local (permitido).
- Sem relógio confiável: LWW depende de `Date.now()` do aparelho (relógio errado pode fazer uma edição "perder").
- Sync não testada contra projeto Supabase real.
- Recomenda-se rodar `npm audit`/SAST caso adicione dependências no futuro.

## Checklist de revisão antes de cada release
`npm run check` · conferir CSP no navegador (console sem violações) · `grep -r "innerHTML" js/` vazio · nenhuma chave secreta no repositório · testar importação de arquivo malformado · testar offline (modo avião).
