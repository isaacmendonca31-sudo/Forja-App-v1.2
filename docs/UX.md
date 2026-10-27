# Usabilidade, UX e acessibilidade

**Princípios:** registrar rápido no meio do treino, nunca perder dados, nunca mudar a ficha sem pedir, linguagem direta em pt-BR.

- **Registro em poucos toques:** carga/reps da última sessão aparecem como sugestão (placeholder); ✓ confirma. Teclado numérico decimal (aceita vírgula).
- **Descanso automático:** inicia ao marcar ✓ (compostos 150 s, isoladores 90 s — ajustável); ±15 s; vibração/bipe opcionais; contagem por timestamp (correta com tela bloqueada). Tela mantida ligada (Wake Lock, opcional).
- **Próximo exercício** destacado; progresso "x de y séries".
- **Trocar exercício:** alternativas ranqueadas por mesma porção muscular, tipo e equipamento disponível; vale só para o treino, a menos que marque "aplicar também à ficha".
- **Máquina ocupada:** sugere o próximo exercício que dá descanso ao último músculo trabalhado e alterna com o antagonista (peito↔costas) para manter o ritmo; ou troca equivalente em outro equipamento; ou deixa para o final.
- **Prevenção de erros:** validação inline (aria-invalid + mensagem), confirmação para ações destrutivas, **Desfazer** (toast 8 s) em exclusões, confirmação digitada só para apagar tudo.
- **Recuperação:** rascunho do treino salvo automaticamente; aviso de nova versão não recarrega sozinho.
- **Acessibilidade (alvo WCAG 2.2 AA):** contraste ≥ 4.5:1; alvos ≥ 48 px; foco visível; `lang=pt-BR`; skip link; `<dialog>` nativo com foco preso/Esc; rótulos em todos os campos; estados não dependem só de cor (▲/▼, textos); gráfico com `role=img` + tabela alternativa; `aria-live` só no fim do descanso; `prefers-reduced-motion`; áreas seguras (notch).
- **Mobile Android first:** layout de coluna única, navegação inferior de 5 itens, inputs ≥16 px (sem zoom), PWA instalável com ícone *maskable*.
- **Instalação:** botão “Instalar” no cabeçalho; usa o prompt do navegador quando disponível e orienta sobre HTTPS/localhost ou instalação manual nos demais casos.
- **Identidade:** escuro "oficina" (#0E0F12) + verde elétrico (#76E06F) para ações; logotipo "F" simples.
- **Tom:** profissional; recomendações sempre rotuladas como sugestão.
- **Visão semanal:** resumo de treinos concluídos com acesso direto a cada dia planejado.
- **Evolução interativa:** filtros de 30 dias, 90 dias e histórico completo; alternância entre volume e frequência nas últimas oito semanas; grupos por séries concluídas e exercícios por volume (ou séries quando não há carga registrada).
- **Compatibilidade:** converter registros locais da versão monolítica uma vez, sem apagar a origem; aceitar também backups JSON antigos em Ajustes.

## 1.2.0 — fluxo, feedback e movimento
- **Início:** treino de hoje em destaque (exercícios, séries, ~minutos, um botão); semana e divisão ficam abaixo. Dia de descanso oferece "Adiantar" o próximo treino.
- **Registro:** carga da série seguinte = a da série anterior do treino; repetições = as da última sessão. Próxima série com borda verde; ao fechar um exercício a tela rola ao próximo. Não abrimos o teclado automaticamente (evita cobrir cronômetro e séries).
- **Recorde:** só existe com histórico prévio (o primeiro registro é referência). Avisado na série (selo + anúncio + vibração) e no resumo.
- **Conclusão:** com todas as séries feitas, um toque finaliza (sem confirmação); com séries pendentes pergunta. Resumo: duração, volume, séries, exercícios, comparação, recordes.
- **Troca com séries feitas:** as séries registradas permanecem no exercício original; o substituto recebe as restantes. Vale só para o treino, salvo "aplicar à ficha".
- **Movimento:** entrada de tela (opacidade + 6 px), ✓ com "pop", linha registrada com realce de 0,6 s, barras e linha dos gráficos crescendo uma vez, cronômetro com barra. Nada contínuo. Com `prefers-reduced-motion` tudo é removido (JS e CSS).
- **Feedback tátil:** `navigator.vibrate` apenas se existir e "Vibrar" estiver ligado (padrões em `feedback.js`).
- **Anúncios:** região `#announcer` (aria-live polite) para série registrada/desmarcada, recorde, descanso, troca, modo de teste. O cronômetro continua anunciando só o fim.
- **Estados vazios:** ícone + título + o que fazer + ação (Histórico, Evolução).
- **Modo de teste:** aviso fixo no topo, etiqueta "Teste" nos treinos simulados, sem exclusão individual.

Sugestão de teste com usuários: 3 sessões reais (você e sua namorada) cronometrando registrar uma série; anotar toques e erros.
