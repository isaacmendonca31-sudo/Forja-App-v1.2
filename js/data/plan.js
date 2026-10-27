/**
 * FORJA — Ficha de treino padrão (hipertrofia, 5 dias).
 *
 * Usada na primeira execução e quando o usuário pede "Restaurar ficha padrão".
 * A ficha é totalmente editável (ver views/plan.js): o app nunca a altera
 * sozinho — apenas sugere.
 *
 * Cada item referencia um exercício da biblioteca por `exerciseId`.
 * weekday segue Date#getDay(): 1 = segunda … 5 = sexta.
 */

// [exerciseId, séries, repMin, repMax, observação?]
const DAYS = [
  {
    id: 'seg', weekday: 1, name: 'Segunda', title: 'Peito + Costas A',
    items: [
      ['supino-reto-barra', 3, 6, 10],
      ['puxada-frente', 3, 8, 12],
      ['supino-inclinado-barra', 3, 8, 12],
      ['remada-baixa', 3, 8, 12],
      ['voador', 2, 12, 15],
      ['puxada-neutra', 2, 10, 12],
    ],
  },
  {
    id: 'ter', weekday: 2, name: 'Terça', title: 'Braços + Ombros A',
    items: [
      ['desenvolvimento-barra', 3, 8, 12],
      ['elevacao-lateral', 3, 12, 15],
      ['rosca-direta-barra', 3, 8, 12],
      ['rosca-scott', 3, 10, 12],
      ['triceps-corda', 3, 10, 12],
      ['triceps-testa-ez', 3, 10, 12],
      ['face-pull', 2, 12, 15],
    ],
  },
  {
    id: 'qua', weekday: 3, name: 'Quarta', title: 'Pernas',
    items: [
      ['mesa-flexora', 3, 10, 15],
      ['stiff-barra', 3, 8, 12],
      ['cadeira-flexora', 2, 10, 15],
      // Os dois itens abaixo possuem "*" na ficha original (sem legenda definida).
      ['leg-press-45', 2, 10, 15, 'Marcado com * na ficha original'],
      ['cadeira-extensora', 2, 12, 15, 'Marcado com * na ficha original'],
      ['panturrilha-maquina', 3, 12, 20],
    ],
  },
  {
    id: 'qui', weekday: 4, name: 'Quinta', title: 'Peito + Costas B',
    items: [
      ['supino-reto-maquina', 3, 8, 12],
      ['puxada-neutra', 3, 8, 12],
      ['supino-inclinado-barra', 3, 8, 12],
      ['remada-baixa', 3, 10, 12],
      ['voador', 2, 12, 15],
      ['pulldown-bracos-estendidos', 2, 12, 15],
    ],
  },
  {
    id: 'sex', weekday: 5, name: 'Sexta', title: 'Braços + Ombros B',
    items: [
      ['desenvolvimento-barra', 3, 8, 12],
      ['elevacao-lateral', 3, 12, 15],
      ['face-pull', 2, 12, 15],
      ['rosca-martelo', 3, 10, 12],
      ['rosca-direta-barra', 2, 10, 12],
      ['triceps-frances-polia', 3, 10, 15],
      ['triceps-barra-polia', 3, 10, 12],
    ],
  },
];

/** Retorna uma cópia nova (mutável) da ficha padrão. */
export function buildDefaultPlan() {
  return {
    days: DAYS.map((d) => ({
      id: d.id,
      weekday: d.weekday,
      name: d.name,
      title: d.title,
      items: d.items.map(([exerciseId, sets, repMin, repMax, note], i) => ({
        id: `${d.id}-${i + 1}`, // id estável e legível do item na ficha
        exerciseId,
        sets,
        repMin,
        repMax,
        note: note || '',
      })),
    })),
    updatedAt: 0, // 0 = nunca editada pelo usuário (sincronização não a sobrescreve)
  };
}

/** Orientações gerais exibidas na tela de ficha. */
export const GUIDELINES = [
  ['Aquecimento', 'Faça séries leves e progressivas antes dos exercícios principais.'],
  ['Intensidade', 'Termine a maioria das séries com 1–3 repetições em reserva.'],
  ['Descanso', '2–3 minutos nos compostos e 60–120 segundos nos isoladores.'],
  ['Progressão', 'Aumente a carga gradualmente ao completar todas as séries no limite superior das repetições, com boa técnica.'],
];
