# Sistema de ranks (C · B · A · S · SSS)

Inspirado em ULTRAKILL e Devil May Cry 5, mas pensado para treino: **você só compete com o seu próprio histórico**.
Implementação em `js/rank.js` (funções puras, testadas em `tests/rank.test.mjs`). Nada novo é gravado: o rank é calculado na hora a partir das sessões.

| Rank | Cor | Significado |
|---|---|---|
| C | amarelo | Bem abaixo do último treino |
| B | azul | Um pouco abaixo (ou primeira vez do exercício) |
| A | verde | Desempenho mantido ou pequena evolução |
| S | roxo | Nova melhor marca ou evolução clara |
| SSS | arco-íris animado | Evolução expressiva sobre a melhor marca |

A letra sempre aparece e o selo tem rótulo acessível ("Rank S"); a cor só reforça.

## Nota por exercício
Compara o 1RM estimado (Epley, ou repetições em exercícios sem carga) do treino com o último treino e com a melhor marca anterior do mesmo exercício.
- **SSS:** ≥ +8% sobre a melhor marca, ou ≥ +10% sobre o último treino estando ≥ +3% acima da melhor marca.
- **S:** superou a melhor marca, ou ≥ +2,5% sobre o último treino (sem estar mais de 2% abaixo da melhor marca).
- **A:** até −2% do último treino (manter vale A) — inclui pequena evolução.
- **B:** entre −2% e −8%. **C:** abaixo disso. O pior resultado é C.
- **Primeira vez do exercício:** B (referência, nunca punição).
- Com menos de 60% das séries previstas, a nota não passa de A (evita "uma série pesada" pontuar alto).
Um degrau comum de carga (ex.: +2,5 kg num supino de 40 kg ≈ +6%) vale S, não SSS. O app **não** sugere aumentar carga por causa do rank e **não** altera a ficha.

## Rank do treino
Combina as notas dos exercícios feitos (pulados não contam):
- S ou melhor em ≥ N exercícios → **SSS** (ex.: três S). A ou melhor em ≥ N → **S** (ex.: três A). N = o maior entre 3 e 40% dos exercícios do treino.
- Sem atingir N, vale a **média ponderada** (mais séries e exercícios compostos pesam mais; compostos ×1,5). O resultado nunca fica abaixo da média.
- Consequência intencional: manter o desempenho em todos os exercícios (A em todos) já rende S no treino.

## Onde aparece
Chip no cartão do exercício ao concluir suas séries; resumo do treino (rank grande + nota por exercício + motivo); detalhe do histórico; último treino no início. O rank do treino colore suavemente a iluminação do fundo (C amarelo, B azul, A verde, S roxo, SSS arco-íris discreto) enquanto o resumo ou o detalhe estão abertos. Com movimento reduzido a cor muda sem animação.

## Limites
- Depende do histórico: com poucos registros as notas são menos informativas.
- Semana leve, troca de exercício ou carga diferente alteram a comparação; o texto do motivo lembra que isso é normal.
- Os limiares ficam em `THRESHOLDS` (`js/rank.js`) para ajuste fácil.
