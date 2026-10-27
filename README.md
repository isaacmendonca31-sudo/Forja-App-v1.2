# FORJA — Diário de treino (PWA)

App de registro e acompanhamento de treinos de musculação (hipertrofia): ficha editável, registro série a série, cronômetro de descanso, histórico, evolução, biblioteca de exercícios, backup e sincronização opcional (Supabase). HTML + CSS + JavaScript puro, **sem dependências**, funciona offline e é instalável no Android.

## Novidades da 1.2.0 (fluxo, feedback e dados de teste)
- **Início focado no treino de hoje:** exercícios do dia, duração estimada e um botão grande; o ritmo semanal fica em segundo plano. Primeira abertura mostra 3 passos curtos (dispensável).
- **Registro rápido de séries:** ✓ usa a sugestão da última sessão; a carga da série seguinte acompanha a que você acabou de usar; a próxima série é destacada e a tela avança para o próximo exercício.
- **Feedback imediato:** vibração (só onde há suporte e se "Vibrar" estiver ligado), animação curta, anúncio para leitores de tela e aviso de **recorde** (carga, 1RM estimado ou repetições).
- **Cronômetro** com barra de progresso, ±15 s, "Pular" e botão manual de descanso.
- **Troca de exercício** preservando as séries já feitas (elas ficam no exercício original; o substituto assume as restantes).
- **Resumo de conclusão:** duração, volume, séries, exercícios, comparação com o treino anterior e recordes.
- **Estados vazios orientadores**, carregamento inicial e animações curtas que respeitam `prefers-reduced-motion`.
- **Modo desenvolvedor (Ajustes):** gera um histórico SIMULADO para testar gráficos e sugestões. Fica em chaves próprias (`forja:demo*`), **fora do backup, da sincronização e dos dados reais**; some ao desligar.
- **Análise em Python** (`scripts/analyze.py`) para estudo e gráficos de desempenho (veja abaixo).

## Análise de dados em Python
O app continua sem dependências e não executa Python; a análise é um utilitário **offline no seu computador**:
```bash
# 1) No app: Ajustes → Backup → Exportar (sem senha)  ou  Ajustes → Modo desenvolvedor → Exportar dados de teste
# 2) No computador:
python3 scripts/analyze.py forja-backup-AAAA-MM-DD.json --out analise
pip install matplotlib     # opcional: só para os gráficos PNG
```
Gera relatório no terminal e, com `--out`, `resumo.json`, CSVs (`sessoes`, `semanal`, `grupos`, `series_por_exercicio`) e gráficos (`volume_semanal.png`, `evolucao_1rm.png`, `series_por_grupo.png`). Backups protegidos por senha não são lidos (exporte sem senha para analisar). Os CSV abrem em planilhas ou `pandas`.

## Modo de teste (dados simulados)
Ajustes → **Modo desenvolvedor** → ligar "Dados de teste" (4, 12 ou 24 semanas). Um aviso fixo indica que o modo está ativo e os treinos simulados levam a etiqueta **Teste**. Garantias (cobertas por `tests/demo-store.test.mjs`): não entram no estado real, no backup, na lista de sincronização nem em `forja:v1`; treinos reais registrados com o modo ligado continuam reais; desligar apaga só os simulados; "Apagar dados deste aparelho" remove tudo. Efeito colateral intencional: enquanto ligado, sugestões e recordes consideram o histórico simulado.

## Experiência integrada (1.1.1)
- Resumo semanal com dias concluídos e acesso direto ao treino planejado.
- Painel de evolução com filtros por 30 dias, 90 dias ou todo o histórico, volume semanal, consistência, séries por grupo muscular e exercícios em destaque.
- Análises calculadas localmente, sem carregar Python ou dados de treino para um serviço externo.
- Na primeira abertura, tenta converter os treinos da versão antiga preservados neste navegador. Backups JSON exportados pelo app antigo também podem ser importados em Ajustes; a importação mescla o histórico e mantém a ficha atual.

## Rodar localmente
```bash
python3 -m http.server 8080      # ou: npm start
# abra http://localhost:8080
```
Service Worker exige `localhost` ou HTTPS. Use o botão **Instalar** no cabeçalho quando o navegador disponibilizar o prompt; caso contrário, siga a orientação do app no menu do navegador. Abrir `index.html` diretamente como `file://` não permite instalar a PWA.

## Publicar (hospedagem estática)
Qualquer uma serve: Netlify, Cloudflare Pages, Vercel, GitHub Pages. Prefira as que aceitam cabeçalhos HTTP (`_headers` já incluído). Veja `docs/DEPLOY.md`.

## Estrutura
```
index.html            casca do app + CSP
sw.js                 service worker (offline)
manifest.webmanifest  instalação PWA
css/style.css         identidade visual e componentes
js/app.js             roteador, SW, erros globais
js/store.js           armazenamento local, registros, lápides
js/validate.js        saneamento (allow-list) de todo dado externo
js/suggest.js         progressão, estagnação, trocas, "máquina ocupada" (funções puras)
js/summary.js         resumo do treino e recordes (funções puras)
js/demo.js            gerador de histórico simulado (puro; armazenamento isolado em store.js)
js/feedback.js        vibração, anúncios para leitores de tela, animações curtas
scripts/analyze.py    análise em Python (relatório, CSV e gráficos), offline
js/sync.js            login + sincronização Supabase (opcional)
js/backup.js          exportar/importar (AES-GCM opcional)
js/views/*            telas
js/data/*             biblioteca de exercícios e ficha padrão
supabase/schema.sql   tabela + RLS + trigger de conflito
tests/                testes automatizados (node --test)
docs/                 SECURITY, UX, PRIVACY, DEPLOY
```

## Testes
```bash
npm run check    # pré-cache + testes JS (node --test) + testes Python (unittest)
```

## Ativar sincronização (opcional, futuro: você + namorada)
1. Crie um projeto no Supabase e rode `supabase/schema.sql` no SQL Editor.
2. Authentication → Providers → Email: **desative "Allow new users to sign up"**, ative confirmação de e-mail; crie as 2 contas em Authentication → Users.
3. Preencha `js/config.js` com `SUPABASE_URL` e a chave **anon/publishable** (nunca a `service_role`).
4. Publique de novo e incremente `VERSION` em `sw.js` e `js/version.js`.
5. Em Ajustes → Conta, entre; o app pergunta se quer enviar os dados locais.

Cada conta só enxerga as próprias linhas (RLS). Conflitos: vence o registro mais recente; exclusões sincronizam via lápides.

## Ao publicar nova versão
Altere `VERSION` em `sw.js` e `js/version.js`; `node scripts/check-precache.mjs` valida. Usuários veem "Nova versão disponível → Atualizar" (nunca recarrega no meio do treino).

## Pontos a confirmar com você
- Os asteriscos em *Leg press 45°\** e *Cadeira extensora\** da ficha não tinham legenda; foram mantidos como observação "Marcado com * na ficha original" (editável).
- Sincronização foi escrita contra a API do Supabase mas **não testada contra um projeto real** (sem credenciais aqui). Teste com uma conta antes de confiar nela; faça backup antes.
