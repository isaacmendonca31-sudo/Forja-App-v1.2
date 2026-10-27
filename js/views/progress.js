/**
 * FORJA — Evolução: gráficos, indicadores, estagnação e sugestões.
 *
 * Todas as recomendações são apenas SUGESTÕES. Qualquer mudança na ficha
 * (ex.: usar uma variação) só acontece após confirmação explícita do usuário.
 */
import { h, icon, fmtNum, fmtDateShort } from '../utils.js';
import {
  getPlan, getSessions, getAllExercises, getExercise, getSettings, savePlan,
} from '../store.js';
import {
  exerciseHistory, suggestProgression, detectStagnation, rankAlternatives,
} from '../suggest.js';
import { lineChart } from '../chart.js';
import { pageHead, emptyBlock, banner, confirmDialog, toast } from '../ui.js';
import { buildTrainingInsights } from '../insights.js';

const METRICS = {
  carga: { label: 'Carga máx.', unit: 'kg', pick: (e) => e.topWeight },
  e1rm: { label: '1RM estimado', unit: 'kg', pick: (e) => e.e1rm },
  volume: { label: 'Volume', unit: 'kg', pick: (e) => e.volume },
  reps: { label: 'Reps (melhor série)', unit: 'reps', pick: (e) => e.bestReps },
};

export function render({ params, rerender }) {
  const sessions = getSessions();
  const plan = getPlan();

  // Exercícios que já têm histórico (para o seletor).
  const withHistory = getAllExercises().filter((e) => exerciseHistory(sessions, e.id).length);
  const root = h('div', { class: 'view' }, pageHead('Evolução', { subtitle: 'Cargas, repetições e sugestões baseadas nos seus registros.' }));

  if (!sessions.length) {
    root.append(emptyBlock({
      iconName: 'chart', title: 'Os gráficos aparecem depois do primeiro treino',
      text: 'Finalize um treino para ver volume semanal, grupos mais trabalhados e a evolução de carga de cada exercício.',
      actions: [h('a', { class: 'btn primary', href: '#/' }, icon('dumbbell'), 'Ir para o treino de hoje')],
    }));
    return { el: root, title: 'Evolução' };
  }

  root.append(insightsPanel(sessions));

  // ───── Alertas da ficha atual ─────
  const planned = new Map(); // exerciseId → { sets, repMin, repMax }
  plan.days.forEach((d) => d.items.forEach((it) => { if (!planned.has(it.exerciseId)) planned.set(it.exerciseId, it); }));
  const alerts = [];
  for (const [exId, p] of planned) {
    const hist = exerciseHistory(sessions, exId);
    if (!hist.length) continue;
    const ex = getExercise(exId);
    const prog = suggestProgression(p, hist.at(-1), ex?.step ?? 2.5);
    const stag = detectStagnation(hist);
    if (prog?.type === 'increase') alerts.push({ exId, name: ex?.name, tag: 'Progressão', cls: 'ok', text: `Sugestão: ${fmtNum(prog.from)} → ${fmtNum(prog.to)} kg` });
    if (stag.stagnated) alerts.push({ exId, name: ex?.name, tag: 'Possível estagnação', cls: 'warn', text: `Sem melhora há ${stag.sessions} sessões` });
  }
  root.append(h('div', { class: 'section-title' }, h('h2', {}, 'Sugestões')));
  if (alerts.length) {
    root.append(h('ul', { class: 'list' }, alerts.map((a) => h('li', {},
      h('a', { class: 'list-item', href: `#/evolucao/${a.exId}` },
        h('span', { class: 'grow' },
          h('span', { class: 'title' }, a.name), h('br'),
          h('span', { class: 'meta' }, a.text)),
        h('span', { class: `tag ${a.cls}` }, a.tag))))));
  } else {
    root.append(h('p', { class: 'muted' }, 'Sem sugestões no momento. Elas aparecem quando você atinge o topo das repetições ou quando a evolução estagna.'));
  }

  // ───── Seletor de exercício ─────
  const select = h('select', {
    id: 'ex-select', class: 'input',
    onChange: (e) => { location.hash = e.target.value ? `#/evolucao/${e.target.value}` : '#/evolucao'; },
  }, h('option', { value: '' }, 'Escolha um exercício…'),
  withHistory.map((e) => h('option', { value: e.id, selected: e.id === params.id ? true : null }, e.name)));
  root.append(h('div', { class: 'field' }, h('label', { for: 'ex-select' }, 'Ver evolução de'), select));

  if (params.id) root.append(detail(params.id, sessions, plan, planned, rerender));

  root.append(h('p', { class: 'hint' }, 'As sugestões são baseadas apenas nos seus registros e não substituem a orientação de um profissional.'));
  return { el: root, title: 'Evolução' };
}

// ───────────── Resumo interativo de consistência e volume ─────────────
function insightsPanel(sessions) {
  let days = 30;
  let metric = sessions.some((session) => session.items.some((item) => item.sets.some((set) => set.weight > 0))) ? 'volume' : 'sessions';
  const root = h('section', { class: 'card insights-panel', 'aria-labelledby': 'insights-title' });
  const periodControls = h('div', { class: 'chips', role: 'group', 'aria-label': 'Período do resumo' });
  const metricControls = h('div', { class: 'chips', role: 'group', 'aria-label': 'Métrica semanal' });
  const stats = h('div', { class: 'stat-grid insight-stats' });
  const chart = h('div', { class: 'week-chart-wrap' });
  const trend = h('div', { class: 'insight-note', role: 'status' });
  const muscles = h('div', { class: 'insight-groups' });
  const top = h('div', { class: 'insight-top' });
  const records = h('div', { class: 'record-board' });

  root.append(
    h('div', { class: 'insight-heading' },
      h('div', {}, h('span', { class: 'eyebrow' }, 'SEU TREINO EM DADOS'), h('h2', { id: 'insights-title' }, 'Resumo do treino')),
      h('span', { class: 'tag' }, 'No aparelho')),
    h('p', { class: 'muted small' }, 'Volume e consistência calculados a partir das séries concluídas.'),
    periodControls,
    stats,
    h('div', { class: 'insight-section' },
      h('div', { class: 'section-title' }, h('h3', {}, 'Ritmo semanal')),
      metricControls, chart),
    trend,
    h('div', { class: 'insight-section' }, h('div', { class: 'section-title' }, h('h3', {}, 'Grupos mais treinados')), muscles),
    h('div', { class: 'insight-section' }, h('div', { class: 'section-title' }, h('h3', {}, 'Exercícios em destaque')), top),
    h('div', { class: 'insight-section' }, h('div', { class: 'section-title' }, h('h3', {}, 'Recordes de carga')), records),
    h('p', { class: 'hint' }, 'Volume = carga × repetições. Exercícios sem carga externa contam nas séries, mas não no volume em kg.'),
  );

  function paint() {
    const data = buildTrainingInsights(sessions, days);
    periodControls.replaceChildren(...[
      { value: 30, label: '30 dias' }, { value: 90, label: '90 dias' }, { value: null, label: 'Tudo' },
    ].map((option) => h('button', {
      type: 'button', class: 'chip', 'aria-pressed': String(days === option.value),
      onClick: () => { days = option.value; paint(); },
    }, option.label)));

    stats.replaceChildren(
      statValue(String(data.trainingDays), 'dias de treino'),
      statValue(String(data.sets), 'séries concluídas'),
      statValue(`${fmtNum(data.volume, 0)} kg`, 'volume no período'),
      statValue(`${fmtNum(data.averageVolume, 0)} kg`, 'média por treino'),
    );

    metricControls.replaceChildren(...[
      { id: 'volume', label: 'Volume' }, { id: 'sessions', label: 'Treinos' },
    ].map((option) => h('button', {
      type: 'button', class: 'chip', 'aria-pressed': String(metric === option.id),
      onClick: () => { metric = option.id; paintChart(data); },
    }, option.label)));
    paintChart(data);

    const comparison = data.previousCount === 0
      ? `Você treinou em ${data.recentCount} dia(s) nos últimos 7 dias. Ainda não há registros na semana anterior para comparar.`
      : data.volumeChange === null
        ? `Você treinou em ${data.recentCount} dia(s) nos últimos 7 dias, contra ${data.previousCount} nos 7 anteriores. Registre cargas para comparar o volume.`
        : `Você treinou em ${data.recentCount} dia(s) nos últimos 7 dias, contra ${data.previousCount} nos 7 anteriores. O volume mudou ${data.volumeChange >= 0 ? '+' : '−'}${fmtNum(Math.abs(data.volumeChange), 1)}% nesse intervalo.`;
    trend.replaceChildren(h('strong', {}, 'Consistência recente'), h('span', {}, comparison));

    const muscleMax = Math.max(1, ...data.topMuscles.map((item) => item.sets));
    muscles.replaceChildren(...(data.topMuscles.length
      ? data.topMuscles.map((item) => h('div', { class: 'insight-bar-row' },
        h('span', { class: 'insight-bar-label' }, item.name),
        h('span', { class: 'insight-bar-track', 'aria-hidden': 'true' },
          h('span', { class: 'insight-bar-fill', style: { '--bar-width': `${Math.max(3, (item.sets / muscleMax) * 100)}%` } })),
        h('strong', { class: 'insight-bar-value' }, `${item.sets} séries`)))
      : [h('p', { class: 'muted small' }, 'Os grupos aparecem quando há séries com carga e repetições registradas.') ]));

    paintRecords(data);

    const hasLoadedExercises = data.topExercises.some((item) => item.volume > 0);
    top.replaceChildren(...(data.topExercises.length
      ? data.topExercises.map((item) => h('a', { class: 'insight-exercise', href: `#/evolucao/${item.id}` },
        h('span', {}, h('strong', {}, item.name), h('small', {}, `${item.sets} séries no período`)),
        h('strong', { class: 'insight-bar-value' }, hasLoadedExercises ? `${fmtNum(item.volume, 0)} kg` : `${item.sets} séries`)))
      : [h('p', { class: 'muted small' }, 'Registre séries com carga para destacar exercícios por volume.') ]));
  }

  function paintRecords(data) {
    records.replaceChildren(...(data.records.length
      ? data.records.map((item) => h('a', { class: 'record-item', href: `#/evolucao/${item.id}` },
        icon('trophy'),
        h('span', { class: 'grow' }, h('strong', {}, item.name), h('small', {}, 'maior carga registrada')),
        h('strong', {}, `${fmtNum(item.bestWeight)} kg`)))
      : [h('p', { class: 'muted small' }, 'Os recordes aparecem quando há séries com carga registrada.')]));
  }

  function paintChart(data) {
    const values = data.weekly.map((week) => metric === 'volume' ? week.volume : week.sessions);
    const max = Math.max(1, ...values);
    const unit = metric === 'volume' ? 'kg' : 'treinos';
    const label = metric === 'volume' ? 'Volume semanal' : 'Treinos por semana';
    const barRows = data.weekly.map((week) => ({
      label: week.label, value: metric === 'volume' ? week.volume : week.sessions,
    }));
    const table = h('table', { class: 'data' },
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col' }, 'Semana'), h('th', { scope: 'col' }, label))),
      h('tbody', {}, barRows.map((bar) => h('tr', {},
        h('td', {}, bar.label), h('td', {}, `${fmtNum(bar.value, 0)} ${unit}`)))));
    chart.replaceChildren(
      h('div', {
        class: 'week-chart', role: 'img',
        'aria-label': `${label} nas oito semanas recentes: ${barRows.map((bar) => `${bar.label}, ${fmtNum(bar.value, 0)} ${unit}`).join('; ')}`,
      }, ...barRows.map((bar) => h('div', { class: 'week-column', title: `${bar.label}: ${fmtNum(bar.value, 0)} ${unit}` },
        h('span', { class: 'week-bar-value' }, fmtNum(bar.value, 0)),
        h('span', { class: 'week-bar-track', 'aria-hidden': 'true' },
          h('span', { class: 'week-bar-fill', style: { '--bar-height': `${bar.value ? Math.max(6, (bar.value / max) * 100) : 0}%` } })),
        h('span', { class: 'week-label' }, bar.label)))),
      h('details', { class: 'week-data' }, h('summary', {}, 'Ver valores em tabela'), table));
  }

  function statValue(value, label) {
    return h('div', { class: 'stat' }, h('div', { class: 'v' }, value), h('div', { class: 'k' }, label));
  }

  paint();
  return root;
}

// ───────────── Detalhe de um exercício ─────────────
function detail(exId, sessions, plan, planned, rerender) {
  const ex = getExercise(exId);
  const hist = exerciseHistory(sessions, exId);
  const box = h('section', { class: 'card', 'aria-label': `Evolução de ${ex?.name ?? 'exercício'}` });

  if (!ex || !hist.length) {
    box.append(h('p', {}, 'Ainda não há registros deste exercício.'));
    return box;
  }

  const bodyweight = hist.every((e) => e.topWeight === 0);
  let metric = bodyweight ? 'reps' : 'carga';
  const view = h('div', { class: 'stack' });
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Métrica do gráfico' });

  function paintChart() {
    const m = METRICS[metric];
    const pts = hist.slice(-20).map((e) => ({ label: fmtDateShort(e.date), value: Math.round(m.pick(e) * 100) / 100 }));
    chips.replaceChildren(...Object.entries(METRICS)
      .filter(([k]) => (bodyweight ? k === 'reps' : true))
      .map(([k, v]) => h('button', {
        type: 'button', class: 'chip', 'aria-pressed': String(k === metric),
        onClick: () => { metric = k; paintChart(); },
      }, v.label)));
    view.replaceChildren(
      lineChart(pts, { unit: m.unit, ariaLabel: `${m.label} de ${ex.name}: de ${fmtNum(pts[0].value)} a ${fmtNum(pts.at(-1).value)} ${m.unit} em ${pts.length} sessões` }),
      h('details', {},
        h('summary', {}, 'Ver dados em tabela'),
        h('table', { class: 'data' },
          h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Data'), h('th', { scope: 'col' }, `${m.label} (${m.unit})`))),
          h('tbody', {}, pts.map((p) => h('tr', {}, h('td', {}, p.label), h('td', {}, fmtNum(p.value))))))));
  }

  const first = hist[0];
  const last = hist.at(-1);
  const change = first.score > 0 ? ((last.score - first.score) / first.score) * 100 : 0;

  box.append(h('h2', {}, ex.name), chips, view,
    h('div', { class: 'stat-grid' },
      h('div', { class: 'stat' }, h('div', { class: 'v' }, bodyweight ? `${Math.max(...hist.map((e) => e.bestReps))} reps` : `${fmtNum(Math.max(...hist.map((e) => e.topWeight)))} kg`), h('div', { class: 'k' }, bodyweight ? 'melhor série' : 'maior carga')),
      h('div', { class: 'stat' }, h('div', { class: 'v' }, String(hist.length)), h('div', { class: 'k' }, 'sessões')),
      h('div', { class: 'stat' }, h('div', { class: 'v' }, `${change >= 0 ? '+' : '−'}${fmtNum(Math.abs(change), 1)}%`), h('div', { class: 'k' }, 'desde o 1º registro')),
      bodyweight ? null : h('div', { class: 'stat' }, h('div', { class: 'v' }, `${fmtNum(Math.max(...hist.map((e) => e.e1rm)), 1)} kg`), h('div', { class: 'k' }, '1RM estimado (melhor)'))));
  paintChart();

  // Progressão
  const p = planned.get(exId) ?? { sets: 3, repMin: 8, repMax: 12 };
  const prog = suggestProgression(p, last, ex.step);
  if (prog) box.append(banner(prog.type === 'increase' ? 'ok' : '', h('strong', {}, 'Progressão'), h('p', {}, prog.message)));

  // Estagnação → variações (apenas sugeridas)
  const stag = detectStagnation(hist);
  if (stag.stagnated) {
    const inPlan = new Set([...planned.keys()]);
    const unavailable = new Set(getSettings().unavailableEquipment);
    const alts = rankAlternatives(
      { exerciseId: exId, group: ex.group, portion: ex.portion, type: ex.type, equipment: ex.equipment },
      getAllExercises(), { exclude: inPlan, unavailable, limit: 3 });
    const warn = banner('warn', h('strong', {}, 'Possível estagnação'), h('p', {}, stag.message));
    if (alts.length) {
      warn.append(h('p', { class: 'muted small' }, 'Variações que trabalham o mesmo músculo:'),
        h('ul', { class: 'pick' }, alts.map(({ exercise: alt, reasons }) => h('li', {},
          h('button', {
            type: 'button', class: 'list-item',
            onClick: () => useInPlan(ex, alt, plan, rerender),
          }, h('span', { class: 'grow' },
            h('span', { class: 'title' }, alt.name), h('br'),
            h('span', { class: 'meta' }, `${reasons.join(' · ')} — tocar para usar na ficha`)))))));
    }
    box.append(warn);
  }
  return box;
}

/** Substitui o exercício na ficha — SOMENTE após confirmação do usuário. */
async function useInPlan(oldEx, newEx, plan, rerender) {
  const days = plan.days.filter((d) => d.items.some((i) => i.exerciseId === oldEx.id));
  if (!days.length) { toast(`${oldEx.name} não está na ficha atual.`); return; }
  const ok = await confirmDialog({
    title: 'Alterar a ficha?',
    message: `Trocar "${oldEx.name}" por "${newEx.name}" em: ${days.map((d) => d.name).join(', ')}. O histórico não é alterado e você pode editar a ficha depois.`,
    confirmLabel: 'Alterar ficha',
  });
  if (!ok) return;
  const p = structuredClone(plan);
  p.days.forEach((d) => d.items.forEach((i) => { if (i.exerciseId === oldEx.id) { i.exerciseId = newEx.id; i.note = ''; } }));
  savePlan(p);
  toast('Ficha atualizada.');
  rerender();
}
