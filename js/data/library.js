/**
 * FORJA — Biblioteca base de exercícios.
 *
 * Dados estáticos e somente leitura. Exercícios criados pelo usuário ficam no
 * armazenamento (store.js) e são mesclados a esta lista em tempo de execução.
 *
 * Campos:
 *  - id        identificador estável (usado na ficha e no histórico; NUNCA renomear)
 *  - group     grupo muscular principal (chave de GROUPS)
 *  - portion   porção/ênfase muscular (usada para sugerir trocas equivalentes)
 *  - equipment equipamento (chave de EQUIPMENT)
 *  - type      'composto' | 'isolador' (define o tempo de descanso sugerido)
 *  - step      salto de carga sugerido em kg (0 = progressão por repetições)
 *  - how       instruções básicas de execução
 */

/** Grupos musculares (chave → rótulo em pt-BR). */
export const GROUPS = {
  peito: 'Peito',
  costas: 'Costas',
  ombros: 'Ombros',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  quadriceps: 'Quadríceps',
  posterior: 'Posterior de coxa',
  gluteos: 'Glúteos',
  panturrilha: 'Panturrilha',
  abdomen: 'Abdômen',
};

/** Equipamentos (chave → rótulo). */
export const EQUIPMENT = {
  barra: 'Barra',
  halter: 'Halteres',
  maquina: 'Máquina',
  polia: 'Polia',
  smith: 'Smith',
  peso_corporal: 'Peso corporal',
  outro: 'Outro',
};

export const TYPES = { composto: 'Composto', isolador: 'Isolador' };

/**
 * Grupos antagonistas: ao alternar entre eles o músculo recém-treinado
 * descansa enquanto o oposto trabalha (usado na sugestão de "máquina ocupada").
 */
export const ANTAGONIST = {
  peito: 'costas',
  costas: 'peito',
  biceps: 'triceps',
  triceps: 'biceps',
  quadriceps: 'posterior',
  posterior: 'quadriceps',
};

// Atalho para manter a lista abaixo compacta e legível.
const ex = (id, name, group, portion, equipment, type, step, how) =>
  Object.freeze({ id, name, group, portion, equipment, type, step, how });

export const BASE_LIBRARY = Object.freeze([
  // ───────────── PEITO ─────────────
  ex('supino-reto-barra', 'Supino reto com barra', 'peito', 'médio', 'barra', 'composto', 2.5,
    'Deite no banco com os pés firmes no chão e as escápulas aproximadas. Desça a barra de forma controlada até a linha do peito e empurre até estender os cotovelos.'),
  ex('supino-inclinado-barra', 'Supino inclinado com barra', 'peito', 'superior', 'barra', 'composto', 2.5,
    'Banco levemente inclinado (30–45°). Desça a barra até a parte alta do peito mantendo os punhos alinhados aos antebraços e empurre sem tirar o quadril do banco.'),
  ex('supino-reto-maquina', 'Supino reto na máquina', 'peito', 'médio', 'maquina', 'composto', 2.5,
    'Ajuste o assento para que as pegadas fiquem na altura do meio do peito. Empurre sem tirar as costas do encosto e retorne com controle.'),
  ex('supino-reto-halteres', 'Supino reto com halteres', 'peito', 'médio', 'halter', 'composto', 2,
    'Desça os halteres com os cotovelos a cerca de 45° do tronco até sentir o alongamento do peito; suba aproximando os halteres sem bater um no outro.'),
  ex('supino-inclinado-halteres', 'Supino inclinado com halteres', 'peito', 'superior', 'halter', 'composto', 2,
    'Banco inclinado (30–45°). Desça com controle até alongar o peito e empurre em leve arco, mantendo as escápulas aproximadas.'),
  ex('supino-inclinado-maquina', 'Supino inclinado na máquina', 'peito', 'superior', 'maquina', 'composto', 2.5,
    'Ajuste o banco para que as pegadas fiquem na altura da parte alta do peito. Empurre e retorne em amplitude confortável, sem tirar os ombros do apoio.'),
  ex('voador', 'Crucifixo na máquina (voador)', 'peito', 'adução', 'maquina', 'isolador', 2.5,
    'Costas apoiadas e cotovelos levemente flexionados. Una os braços à frente do peito e retorne devagar até sentir o alongamento, sem jogar os ombros para frente.'),
  ex('crucifixo-halteres', 'Crucifixo com halteres', 'peito', 'adução', 'halter', 'isolador', 2,
    'Cotovelos levemente flexionados e fixos. Abra os braços em arco até alongar o peito e retorne apertando o peito, sem descer além do conforto dos ombros.'),
  ex('crossover-polia', 'Crossover na polia', 'peito', 'adução', 'polia', 'isolador', 2.5,
    'Tronco levemente inclinado à frente, cotovelos semiflexionados. Traga as mãos em arco até se encontrarem à frente do corpo e retorne com controle.'),
  ex('flexao-bracos', 'Flexão de braços', 'peito', 'médio', 'peso_corporal', 'composto', 0,
    'Corpo alinhado da cabeça aos calcanhares, mãos um pouco mais abertas que os ombros. Desça até o peito ficar próximo ao chão e empurre mantendo o abdômen firme.'),

  // ───────────── COSTAS ─────────────
  ex('puxada-frente', 'Puxada alta pela frente', 'costas', 'largura', 'polia', 'composto', 2.5,
    'Pegada um pouco mais aberta que os ombros. Puxe a barra até a altura do queixo/peito conduzindo os cotovelos para baixo, sem balançar o tronco.'),
  ex('puxada-neutra', 'Puxada alta com pegada neutra', 'costas', 'largura', 'polia', 'composto', 2.5,
    'Use o triângulo/pegada neutra. Puxe em direção ao peito levando os cotovelos para baixo e para trás; retorne alongando totalmente as costas.'),
  ex('puxada-supinada', 'Puxada alta supinada', 'costas', 'largura', 'polia', 'composto', 2.5,
    'Pegada com as palmas voltadas para você, na largura dos ombros. Puxe até o peito mantendo o peito aberto e retorne com controle.'),
  ex('barra-fixa', 'Barra fixa', 'costas', 'largura', 'peso_corporal', 'composto', 0,
    'Pegada um pouco mais aberta que os ombros. Puxe o corpo até o queixo passar da barra e desça com controle até estender os braços.'),
  ex('remada-baixa', 'Remada baixa na polia', 'costas', 'espessura', 'polia', 'composto', 2.5,
    'Tronco ereto, joelhos levemente flexionados. Puxe o triângulo ao abdômen levando os cotovelos para trás e retorne alongando sem arredondar a coluna.'),
  ex('remada-curvada', 'Remada curvada com barra', 'costas', 'espessura', 'barra', 'composto', 2.5,
    'Incline o tronco com a coluna neutra e joelhos flexionados. Puxe a barra em direção ao abdômen e desça controlando; evite impulso com o quadril.'),
  ex('remada-maquina', 'Remada na máquina', 'costas', 'espessura', 'maquina', 'composto', 2.5,
    'Peito apoiado no suporte. Puxe as pegadas levando os cotovelos para trás, aproximando as escápulas, e retorne alongando.'),
  ex('remada-unilateral', 'Remada unilateral com halter', 'costas', 'espessura', 'halter', 'composto', 2,
    'Apoie uma mão e o joelho no banco, coluna neutra. Puxe o halter em direção ao quadril e desça alongando o dorsal.'),
  ex('pulldown-bracos-estendidos', 'Pulldown com braços estendidos na polia', 'costas', 'largura', 'polia', 'isolador', 2.5,
    'Braços quase estendidos e tronco levemente inclinado. Leve a barra/corda até as coxas em arco, sentindo o dorsal, e retorne devagar.'),

  // ───────────── OMBROS ─────────────
  ex('desenvolvimento-barra', 'Desenvolvimento com barra', 'ombros', 'geral', 'barra', 'composto', 2.5,
    'Abdômen e glúteos firmes. Empurre a barra da altura do queixo até estender os braços acima da cabeça e retorne com controle.'),
  ex('desenvolvimento-halteres', 'Desenvolvimento com halteres', 'ombros', 'geral', 'halter', 'composto', 2,
    'Halteres na altura das orelhas. Empurre até estender os braços sem bater os halteres e desça com controle.'),
  ex('desenvolvimento-maquina', 'Desenvolvimento na máquina', 'ombros', 'geral', 'maquina', 'composto', 2.5,
    'Ajuste o assento para que as pegadas partam da altura dos ombros. Empurre e retorne sem projetar as costelas.'),
  ex('elevacao-lateral', 'Elevação lateral', 'ombros', 'lateral', 'halter', 'isolador', 1,
    'Cotovelos levemente flexionados. Eleve os halteres lateralmente até a altura dos ombros e desça devagar, sem balançar o tronco.'),
  ex('elevacao-lateral-polia', 'Elevação lateral na polia', 'ombros', 'lateral', 'polia', 'isolador', 2.5,
    'Polia baixa, corpo de lado para o equipamento. Eleve o braço lateralmente até a altura do ombro e retorne com controle.'),
  ex('face-pull', 'Face pull na polia', 'ombros', 'posterior', 'polia', 'isolador', 2.5,
    'Polia na altura do rosto, corda. Puxe em direção ao rosto abrindo os cotovelos e rodando os ombros para trás; retorne devagar.'),
  ex('crucifixo-inverso-maquina', 'Crucifixo inverso na máquina', 'ombros', 'posterior', 'maquina', 'isolador', 2.5,
    'Peito apoiado no suporte. Abra os braços para trás até a linha dos ombros, sem encolher o pescoço, e retorne com controle.'),

  // ───────────── BÍCEPS ─────────────
  ex('rosca-direta-barra', 'Rosca direta com barra', 'biceps', 'geral', 'barra', 'isolador', 2.5,
    'Cotovelos junto ao tronco. Flexione os cotovelos até contrair o bíceps e desça devagar, sem balançar o corpo.'),
  ex('rosca-scott', 'Rosca Scott', 'biceps', 'geral', 'barra', 'isolador', 2.5,
    'Braços apoiados no banco Scott. Flexione até contrair o bíceps e desça controlando até quase estender, sem perder o apoio.'),
  ex('rosca-martelo', 'Rosca martelo com halteres', 'biceps', 'braquial', 'halter', 'isolador', 2,
    'Pegada neutra (palmas voltadas uma para a outra). Flexione os cotovelos sem movê-los para frente e desça com controle.'),
  ex('rosca-alternada', 'Rosca alternada com halteres', 'biceps', 'geral', 'halter', 'isolador', 2,
    'Alterne os braços girando o punho para cima durante a subida. Mantenha os cotovelos junto ao corpo e evite impulso.'),
  ex('rosca-polia', 'Rosca na polia', 'biceps', 'geral', 'polia', 'isolador', 2.5,
    'Polia baixa com barra reta ou EZ. Flexione os cotovelos mantendo-os fixos; a polia mantém a tensão durante todo o movimento.'),
  ex('rosca-inclinada', 'Rosca inclinada com halteres', 'biceps', 'cabeça longa', 'halter', 'isolador', 2,
    'Banco inclinado (45–60°), braços pendentes. Flexione sem levar os cotovelos para frente e desça até alongar bem o bíceps.'),

  // ───────────── TRÍCEPS ─────────────
  ex('triceps-corda', 'Tríceps na polia com corda', 'triceps', 'lateral', 'polia', 'isolador', 2.5,
    'Cotovelos fixos ao lado do tronco. Estenda os braços abrindo a corda no final e retorne até 90° sem elevar os ombros.'),
  ex('triceps-barra-polia', 'Tríceps na polia com barra', 'triceps', 'lateral', 'polia', 'isolador', 2.5,
    'Cotovelos fixos junto ao corpo. Empurre a barra para baixo até estender os cotovelos e retorne controlando.'),
  ex('triceps-testa-ez', 'Tríceps testa com barra EZ', 'triceps', 'cabeça longa', 'barra', 'isolador', 2.5,
    'Deitado, cotovelos apontando para o teto. Flexione os cotovelos levando a barra em direção à testa e estenda sem abrir os cotovelos.'),
  ex('triceps-frances-polia', 'Tríceps francês na polia', 'triceps', 'cabeça longa', 'polia', 'isolador', 2.5,
    'De costas para a polia, cotovelos junto à cabeça. Estenda os braços acima da cabeça e retorne alongando o tríceps.'),
  ex('triceps-frances-halter', 'Tríceps francês com halter', 'triceps', 'cabeça longa', 'halter', 'isolador', 2,
    'Segure um halter com as duas mãos acima da cabeça. Flexione os cotovelos descendo o halter atrás da cabeça e estenda sem abrir os cotovelos.'),
  ex('mergulho-paralelas', 'Mergulho em paralelas', 'triceps', 'geral', 'peso_corporal', 'composto', 0,
    'Tronco ereto para enfatizar o tríceps. Desça até os cotovelos formarem cerca de 90° e empurre até estender. Interrompa se sentir dor nos ombros.'),

  // ───────────── QUADRÍCEPS ─────────────
  ex('leg-press-45', 'Leg press 45°', 'quadriceps', 'geral', 'maquina', 'composto', 5,
    'Pés na largura dos ombros, lombar apoiada. Desça até onde mantiver a lombar colada ao encosto e empurre sem travar os joelhos no final.'),
  ex('cadeira-extensora', 'Cadeira extensora', 'quadriceps', 'geral', 'maquina', 'isolador', 2.5,
    'Ajuste o encosto para o joelho alinhar ao eixo. Estenda os joelhos contraindo o quadríceps e desça devagar.'),
  ex('agachamento-livre', 'Agachamento livre', 'quadriceps', 'geral', 'barra', 'composto', 2.5,
    'Barra apoiada nas costas, pés na largura dos ombros. Desça com a coluna neutra e joelhos acompanhando os pés; suba empurrando o chão. Use apoio de segurança quando possível.'),
  ex('hack-squat', 'Hack squat', 'quadriceps', 'geral', 'maquina', 'composto', 5,
    'Costas apoiadas no encosto, pés na largura dos ombros. Desça de forma controlada e suba sem travar os joelhos.'),
  ex('agachamento-smith', 'Agachamento no Smith', 'quadriceps', 'geral', 'smith', 'composto', 2.5,
    'Pés levemente à frente da barra. Desça com controle mantendo o tronco estável e suba empurrando o chão.'),
  ex('afundo-halteres', 'Afundo com halteres', 'quadriceps', 'geral', 'halter', 'composto', 2,
    'Passo largo à frente, tronco ereto. Desça até o joelho de trás quase tocar o chão e volte empurrando com a perna da frente.'),

  // ───────────── POSTERIOR DE COXA ─────────────
  ex('mesa-flexora', 'Mesa flexora', 'posterior', 'isquiotibiais', 'maquina', 'isolador', 2.5,
    'Deitado, quadril apoiado. Flexione os joelhos levando o rolo em direção aos glúteos e retorne devagar sem descolar o quadril.'),
  ex('cadeira-flexora', 'Cadeira flexora sentada', 'posterior', 'isquiotibiais', 'maquina', 'isolador', 2.5,
    'Ajuste o apoio das coxas para ficar firme. Flexione os joelhos contraindo a parte de trás da coxa e retorne com controle.'),
  ex('stiff-barra', 'Stiff com barra', 'posterior', 'quadril', 'barra', 'composto', 2.5,
    'Joelhos levemente flexionados, coluna neutra. Leve o quadril para trás deslizando a barra junto às pernas até alongar o posterior; volte estendendo o quadril.'),
  ex('stiff-halteres', 'Stiff com halteres', 'posterior', 'quadril', 'halter', 'composto', 2,
    'Joelhos levemente flexionados, coluna neutra. Leve o quadril para trás descendo os halteres junto às pernas e retorne contraindo os glúteos.'),

  // ───────────── GLÚTEOS ─────────────
  ex('elevacao-pelvica', 'Elevação pélvica com barra', 'gluteos', 'geral', 'barra', 'composto', 5,
    'Costas apoiadas no banco e barra sobre o quadril (use apoio acolchoado). Suba o quadril contraindo os glúteos até alinhar tronco e coxas e desça com controle.'),
  ex('cadeira-abdutora', 'Cadeira abdutora', 'gluteos', 'geral', 'maquina', 'isolador', 2.5,
    'Costas apoiadas. Abra as pernas contra a resistência e retorne devagar, sem usar impulso.'),

  // ───────────── PANTURRILHA ─────────────
  ex('panturrilha-maquina', 'Panturrilha na máquina', 'panturrilha', 'gastrocnêmio', 'maquina', 'isolador', 5,
    'Joelhos estendidos. Desça o calcanhar até alongar e suba o máximo possível, com pausa breve no topo.'),
  ex('panturrilha-sentado', 'Panturrilha sentado', 'panturrilha', 'sóleo', 'maquina', 'isolador', 2.5,
    'Joelhos flexionados a 90°. Suba os calcanhares o máximo possível e desça alongando totalmente.'),
  ex('panturrilha-leg-press', 'Panturrilha no leg press', 'panturrilha', 'gastrocnêmio', 'maquina', 'isolador', 5,
    'Apoie só a ponta dos pés na plataforma, joelhos quase estendidos. Empurre e retorne alongando a panturrilha.'),

  // ───────────── ABDÔMEN ─────────────
  ex('abdominal-polia', 'Abdominal na polia', 'abdomen', 'geral', 'polia', 'isolador', 2.5,
    'Ajoelhado, corda na altura da cabeça. Flexione o tronco aproximando as costelas do quadril e retorne controlando.'),
  ex('elevacao-pernas', 'Elevação de pernas', 'abdomen', 'geral', 'peso_corporal', 'isolador', 0,
    'Apoiado ou suspenso, eleve as pernas controlando o movimento e evitando balanço; mantenha o abdômen contraído.'),
]);
