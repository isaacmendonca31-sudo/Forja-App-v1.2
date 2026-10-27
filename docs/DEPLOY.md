# Publicação

1. Envie a pasta como site estático (HTTPS obrigatório para instalar/offline).
2. **Cabeçalhos de segurança:** Netlify/Cloudflare Pages usam `_headers`. Para nginx:
```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://*.supabase.co; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" always;
add_header X-Content-Type-Options nosniff always;
add_header Referrer-Policy no-referrer always;
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
location = /sw.js { add_header Cache-Control no-cache; }
```
GitHub Pages não permite cabeçalhos: vale a CSP em `<meta>` do `index.html` (sem `frame-ancestors`).
3. Domínio próprio do Supabase? Ajuste `connect-src` e a regex em `js/sync.js`.
4. Nova versão: incrementar `VERSION` (sw.js + js/version.js) e rodar `npm run check`.
