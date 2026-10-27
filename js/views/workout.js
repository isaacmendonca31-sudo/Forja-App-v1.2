/**
 * FORJA — Tela de treino em andamento (registro rápido, série a série).
 *
 * Princípios de UX aplicados:
 *  • Registro com poucos toques: valores da última sessão aparecem como sugestão
 *    (placeholder) e o ✓ confirma; basta digitar o que mudou. A carga da série
 *    seguinte acompanha a que a pessoa acabou de usar.
 *  • Avanço automático: ao marcar ✓, o descanso começa, a próxima série é
 *    destacada e, ao terminar um exercício, a tela segue para o próximo.
 *  • Feedback imediato: vibração (se suportada e ativada), animação curta,
 *    anúncio para leitores de tela e aviso de recorde.
 *  • Rascunho salvo automaticamente: fechar o app ou perder a bateria não perde o treino.
 *  • Trocar exercício / "máquina ocupada" mudam só ESTE treino; a ficha só é
 *    alterada se o usuário marcar explicitamente "aplicar também à ficha".
 *    Séries já registradas ficam preservadas no exercício original.
 */
import {
  h, icon, uid, isoDate, parseDecimal, fmtNum, fmtDateShort, fmtClock, debounce,
} from '../utils.js';
import {
  getPlan, savePlan, getSessions, getAllExercises, getExercise, getSettings,
  loadDraft, saveDraft, clearDraft, addSession,
} from '../store.js';
import { GROUPS, EQUIPMENT } from '../data/library.js';
import {
  exerciseHistory, suggestProgression, rankAlternatives, suggestBusy,
} from '../suggest.js';
import {
  sessionStats, findRecords, previousBest, mergeBest, bestOf, recordKind, fmtDuration,
} from '../summary.js';
import { startRest, stopRest } from '../timer.js';
import { pageHead, modal, confirmDialog, toast, banner } from '../ui.js';
import { haptic, announce, pulse, motionOK, growBar } from '../feedback.js';

const RECORD_TEXT = {
  carga: 'Nova carga máxima',
  '1rm': 'Novo 1RM estimado',
  reps: 'Novo recorde de repetições',
};

// ───────────── Criação do rascunho a partir da ficha ─────────────
function buildItem(exerciseId, planned, planItemId, planNote = '') {
  const ex = getExercise(exerciseId);
  return {
    key: uid(),
    planItemId,
    exerciseId,
    name: ex?.name ?? 'Exercício',
    group: ex?.group ?? 'peito',
    type: ex?.type ?? 'isolador',
    portion: ex?.portion ?? '',
    equipment: ex?.equipment ?? 'outro',
    planned: { sets: planned.sets, repMin: planned.repMin, repMax: planned.repMax },
    planNote,
    note: '',
    skipped: false,
    doneAt: 0,
    sets: Array.from({ length: planned.sets }, () => ({ weight: '', reps: '', done: false })),
  };
}

function createDraft(day) {
  return {
    id: uid(),
    dayId: day.id,
    title: day.title,
    date: isoDate(),
    startedAt: Date.now(),
    note: '',
    items: day.items.map((it) => buildItem(it.exerciseId, it, it.id, it.note)),
  };
}

const commaNum = (v) => String(v).replace('.', ',');

// ───────────── Tela ─────────────
export function render({ params, navigate, rerender }) {
  const plan = getPlan();
  const day = plan.days.find((d) => d.id === params.id);
  if (!day) {
    return {
      title: 'Treino não encontrado',
      el: h('div', { class: 'view' }, pageHead('Treino não encontrado', { back: '#/' }),
        h('a', { class: 'btn primary', href: '#/' }, 'Voltar ao início')),
    };
  }

  let draft = loadDraft();

  // Já existe outro treino em andamento: o usuário decide (nada é descartado sozinho).
  if (draft && draft.dayId !== day.id) {
    const other = draft;
    return {
      title: 'Treino em andamento',
      el: h('div', { class: 'view' },
        pageHead('Treino em andamento', { back: '#/' }),
        banner('warn',
          h('p', {}, `Você já tem um treino em andamento: `, h('strong', {}, other.title), '.'),
          h('div', { class: 'stack' },
            h('a', { class: 'btn primary', href: `#/treino/${other.dayId}` }, 'Continuar esse treino'),
            h('button', {
              type: 'button', class: 'btn danger',
              onClick: async () => {
                const ok = await confirmDialog({
                  title: 'Descartar o treino em andamento?',
                  message: `As séries registradas em "${other.title}" serão perdidas.`,
                  confirmLabel: 'Descartar e iniciar este', danger: true,
                });
                if (ok) { clearDraft(); rerender(); }
              },
            }, `Descartar e iniciar ${day.title}`)))),
    };
  }

  if (!draft) { draft = createDraft(day); saveDraft(draft); }

  const settings = getSettings();
  const unavailable = new Set(settings.unavailableEquipment);
  // Depois de finalizar/descartar, o rascunho NÃO pode ser regravado (o destroy() faz flush).
  let closed = false;
  const persist = debounce(() => { if (!closed) saveDraft(draft); }, 250);
  const sessions = getSessions();
  const histCache = new Map(); // exerciseId → último registro
  const refs = new Map(); // item.key → { rows: [{ row, w, r, btn }], head }
  let finishing = false;

  const lastOf = (exerciseId) => {
    if (!histCache.has(exerciseId)) histCache.set(exerciseId, exerciseHistory(sessions, exerciseId).at(-1) ?? null);
    return histCache.get(exerciseId);
  };

  /**
   * Valores sugeridos para a série `i` (texto do placeholder e valor usado ao tocar ✓).
   * Carga: a da série anterior deste treino (a pessoa pode ter subido o peso), senão a da
   * última sessão. Repetições: as da última sessão, senão as da série anterior.
   */
  function suggestionFor(item, i) {
    const last = lastOf(item.exerciseId);
    const ref = last ? (last.sets[i] ?? last.sets.at(-1)) : null;
    const prev = i > 0 && item.sets[i - 1].done ? item.sets[i - 1] : null;
    const weight = prev ? commaNum(prev.weight) : ref ? commaNum(ref.weight) : '';
    const reps = ref ? String(ref.reps) : prev ? String(prev.reps) : '';
    return { weight, reps };
  }

  // ───── Progresso geral ─────
  const progressText = h('span', { class: 'muted' });
  const progressFill = h('span');
  const progressBar = h('div', {
    class: 'progress', role: 'progressbar', 'aria-label': 'Séries concluídas',
    'aria-valuemin': '0',
  }, progressFill);

  const activeItems = () => draft.items.filter((i) => !i.skipped);
  const totals = () => {
    const all = activeItems().flatMap((i) => i.sets);
    return { total: all.length, done: all.filter((s) => s.done).length };
  };
  function updateProgress() {
    const { total, done } = totals();
    progressText.textContent = `${done} de ${total} séries`;
    progressBar.setAttribute('aria-valuemax', String(total));
    progressBar.setAttribute('aria-valuenow', String(done));
    progressFill.style.setProperty('--pct', `${total ? (done / total) * 100 : 0}%`);
  }

  const currentItem = () => draft.items.find((i) => !i.skipped && !i.sets.every((s) => s.done));

  // Destaca o exercício atual e a próxima série a fazer.
  function markCurrent() {
    const cur = currentItem();
    list.querySelectorAll('.card').forEach((c) => {
      c.classList.toggle('current', Boolean(cur) && c.dataset.key === cur.key);
    });
    for (const [key, ref] of refs) {
      const it = draft.items.find((x) => x.key === key);
      const nextIdx = cur && it === cur ? it.sets.findIndex((s) => !s.done) : -1;
      ref.rows.forEach((r, i) => {
        r.row.classList.toggle('is-next', i === nextIdx);
        if (it && !it.sets[i]?.done) refreshPlaceholders(it, i, r);
      });
      ref.card?.classList.toggle('finished-card', Boolean(it) && !it.skipped && it.sets.length > 0 && it.sets.every((s) => s.done));
    }
  }

  function refreshPlaceholders(item, i, r) {
    const sug = suggestionFor(item, i);
    r.w.placeholder = sug.weight || 'kg';
    r.r.placeholder = sug.reps || 'reps';
  }

  // ───── Cartão de exercício ─────
  function renderCard(item) {
    const last = lastOf(item.exerciseId);
    const step = getExercise(item.exerciseId)?.step ?? 2.5;
    const progression = suggestProgression(item.planned, last, step);
    const card = h('section', { class: 'card', 'aria-label': item.name, dataset: { key: item.key } });
    const ref = { rows: [], card, head: null };
    refs.set(item.key, ref);

    const head = h('div', { class: 'card-head' },
      h('h2', {}, item.name),
      h('span', { class: 'tag' }, GROUPS[item.group] ?? ''));
    ref.head = head;

    if (item.skipped) {
      card.classList.add('skipped');
      card.append(head,
        h('p', { class: 'muted' }, 'Exercício pulado neste treino.'),
        h('button', { type: 'button', class: 'btn small', onClick: () => { item.skipped = false; persist(); repaintCard(item); updateProgress(); markCurrent(); } }, 'Desfazer'));
      return card;
    }

    card.append(...[head,
      h('p', {},
        h('span', { class: 'target' }, `${item.planned.sets} × ${item.planned.repMin}–${item.planned.repMax}`),
        h('span', { class: 'muted' }, ` · ${EQUIPMENT[item.equipment] ?? ''}${item.type === 'composto' ? ' · composto' : ''}`)),
      item.planNote ? h('p', { class: 'hint' }, item.planNote) : null,
      last
        ? h('p', { class: 'last-time' }, `Anterior (${fmtDateShort(last.date)}): `,
          last.sets.map((s) => `${fmtNum(s.weight)}×${s.reps}`).join(' · '))
        : h('p', { class: 'last-time' }, 'Sem registro anterior deste exercício.')].filter(Boolean)); // filter: append(null) escreveria "null" na tela

    // Sugestão de progressão: apenas informa; o usuário decide aplicar.
    if (progression) {
      const box = h('div', { class: `banner ${progression.type === 'increase' ? 'ok' : ''}` },
        h('p', {}, h('strong', {}, 'Sugestão'), progression.message));
      if (progression.type === 'increase') {
        box.append(h('button', {
          type: 'button', class: 'btn small',
          onClick: () => {
            item.sets.forEach((s) => { if (!s.done) s.weight = commaNum(progression.to); });
            persist(); repaintCard(item);
            announce(`Carga de ${fmtNum(progression.to)} quilos aplicada às séries pendentes.`);
          },
        }, `Usar ${fmtNum(progression.to)} kg nas séries`));
      }
      card.append(box);
    }

    // Séries
    card.append(h('div', { class: 'set-heads', 'aria-hidden': 'true' },
      h('span', {}, 'Série'), h('span', {}, 'Carga (kg)'), h('span', {}, 'Reps'), h('span', {}, '')));
    const status = h('p', { class: 'error-text', role: 'alert' });
    const rows = h('div', { class: 'stack' });
    item.sets.forEach((_, i) => rows.append(setRow(item, i, status, ref)));
    card.append(rows, status);

    // Ações do exercício
    card.append(h('div', { class: 'card-actions' },
      h('button', { type: 'button', class: 'btn small', onClick: () => { item.sets.push({ weight: '', reps: '', done: false }); persist(); repaintCard(item); updateProgress(); } }, icon('plus'), 'Série'),
      item.sets.length > 1 && !item.sets.at(-1).done
        ? h('button', { type: 'button', class: 'btn small ghost', 'aria-label': 'Remover última série', onClick: () => { item.sets.pop(); persist(); repaintCard(item); updateProgress(); } }, icon('minus'), 'Série')
        : null,
      h('button', { type: 'button', class: 'btn small', onClick: () => openSwap(item) }, icon('swap'), 'Trocar'),
      h('button', { type: 'button', class: 'btn small', onClick: () => openBusy(item) }, 'Máquina ocupada'),
      h('button', { type: 'button', class: 'btn small ghost', 'aria-label': `Como executar ${item.name}`, onClick: () => openInfo(item) }, icon('info'), 'Como fazer')));

    // Observações do exercício
    const details = h('details', { open: item.note ? true : null },
      h('summary', {}, 'Observações'),
      h('textarea', {
        class: 'input', maxlength: '500', 'aria-label': `Observações de ${item.name}`,
        placeholder: 'Ex.: ajuste do banco, dor, sensação…', value: item.note,
        onInput: (e) => { item.note = e.target.value; persist(); },
      }));
    card.append(details);

    if (!item.sets.some((s) => s.done)) {
      card.append(h('button', {
        type: 'button', class: 'link-btn',
        onClick: () => { item.skipped = true; persist(); repaintCard(item); updateProgress(); markCurrent(); },
      }, 'Pular exercício'));
    }
    return card;
  }

  /** Recorde ao registrar uma série (só existe se já há histórico do exercício). */
  function liveRecord(item, s) {
    const prev = previousBest(sessions, item.exerciseId);
    if (!prev) return null;
    const others = item.sets.filter((x) => x !== s && x.done).map((x) => ({ weight: Number(x.weight), reps: Number(x.reps) }));
    const baseline = mergeBest(prev, others.length ? bestOf(others) : null);
    const kind = recordKind(baseline, bestOf([{ weight: Number(s.weight), reps: Number(s.reps) }]));
    return kind ? { kind, value: kind === 'reps' ? Number(s.reps) : Number(s.weight) } : null;
  }

  function showRecordBadge(item, rec) {
    const head = refs.get(item.key)?.head;
    if (!head) return;
    head.querySelector('.pr-badge')?.remove();
    const label = `${RECORD_TEXT[rec.kind]}${rec.kind === 'reps' ? '' : `: ${fmtNum(rec.value)} kg`}`;
    head.append(h('span', { class: 'pr-badge' }, icon('trophy'), label));
  }

  function setRow(item, i, status, ref) {
    const s = item.sets[i];
    const sug = suggestionFor(item, i);

    const w = h('input', {
      class: 'input', type: 'text', inputmode: 'decimal', autocomplete: 'off', maxlength: '7',
      'aria-label': `Série ${i + 1}, carga em quilos`, placeholder: sug.weight || 'kg', value: s.weight,
      readonly: s.done || null,
      onInput: (e) => { s.weight = e.target.value; e.target.removeAttribute('aria-invalid'); persist(); },
    });
    const r = h('input', {
      class: 'input', type: 'text', inputmode: 'numeric', autocomplete: 'off', maxlength: '3',
      'aria-label': `Série ${i + 1}, repetições`, placeholder: sug.reps || 'reps', value: s.reps,
      readonly: s.done || null,
      onInput: (e) => { s.reps = e.target.value; e.target.removeAttribute('aria-invalid'); persist(); },
    });
    const btn = h('button', {
      type: 'button', class: 'done-btn', 'aria-pressed': String(s.done),
      'aria-label': `Série ${i + 1}: ${s.done ? 'desmarcar' : 'marcar como feita'}`,
    }, icon('check'));
    const row = h('div', { class: 'set-row' }, h('span', { class: 'set-n' }, String(i + 1)), w, r, btn);
    ref.rows.push({ row, w, r, btn });

    btn.addEventListener('click', () => {
      status.textContent = '';
      if (s.done) { // desfazer
        s.done = false;
        haptic('tap');
        announce(`Série ${i + 1} desmarcada.`);
        w.readOnly = false; r.readOnly = false;
        btn.setAttribute('aria-pressed', 'false');
        btn.setAttribute('aria-label', `Série ${i + 1}: marcar como feita`);
        row.classList.remove('logged');
        persist(); updateProgress(); markCurrent();
        return;
      }

      const live = suggestionFor(item, i); // valores sugeridos valem se nada foi digitado
      const wText = s.weight !== '' ? s.weight : live.weight;
      const rText = (s.reps !== '' ? s.reps : live.reps).trim();
      const weight = parseDecimal(wText);
      const reps = /^\d{1,3}$/.test(rText) ? Number(rText) : NaN;
      const badW = !(weight >= 0 && weight <= 1000);
      const badR = !(reps >= 1 && reps <= 100);
      if (badW) w.setAttribute('aria-invalid', 'true'); else w.removeAttribute('aria-invalid');
      if (badR) r.setAttribute('aria-invalid', 'true'); else r.removeAttribute('aria-invalid');
      if (badW || badR) {
        status.textContent = `Série ${i + 1}: informe a carga (0 a 1000 kg) e as repetições (1 a 100).`;
        haptic('tap');
        (badW ? w : r).focus();
        return;
      }

      s.weight = String(weight);
      s.reps = String(reps);
      s.done = true;
      item.doneAt = Date.now();
      w.value = s.weight; r.value = s.reps;
      w.readOnly = true; r.readOnly = true;
      btn.setAttribute('aria-pressed', 'true');
      btn.setAttribute('aria-label', `Série ${i + 1}: desmarcar`);

      // Feedback imediato
      haptic('done');
      pulse(btn, 'pop');
      pulse(row, 'logged');
      let message = `Série ${i + 1} registrada: ${fmtNum(weight)} quilos, ${reps} repetições.`;

      const rec = liveRecord(item, s);
      if (rec) {
        showRecordBadge(item, rec);
        haptic('record');
        message += ` ${RECORD_TEXT[rec.kind]}.`;
      }

      const { total, done } = totals();
      const exerciseDone = item.sets.every((x) => x.done);
      if (done >= total) { // esta era a última série pendente do treino
        stopRest();
        toast('Todas as séries concluídas. Toque em "Finalizar treino".');
        message += ' Todas as séries do treino foram concluídas.';
      } else {
        const secs = item.type === 'composto' ? getSettings().restCompound : getSettings().restIsolation;
        startRest(secs, 'Descanso');
        message += ` Descanso de ${fmtClock(secs)} iniciado.`;
      }
      persist(); updateProgress(); markCurrent();

      // Avanço: próxima série do mesmo exercício ou próximo exercício pendente.
      const nextRow = ref.rows[item.sets.findIndex((x) => !x.done)];
      if (!exerciseDone && nextRow) {
        nextRow.row.scrollIntoView({ block: 'nearest', behavior: motionOK() ? 'smooth' : 'auto' });
      } else if (exerciseDone) {
        const nxt = currentItem();
        if (nxt) {
          message += ` Próximo exercício: ${nxt.name}.`;
          setTimeout(() => scrollToCard(nxt), motionOK() ? 300 : 0);
        } else {
          setTimeout(() => finishBtn.scrollIntoView({ block: 'center', behavior: motionOK() ? 'smooth' : 'auto' }), motionOK() ? 300 : 0);
        }
      }
      announce(message);
    });

    return row;
  }

  function repaintCard(item) {
    const old = list.querySelector(`[data-key="${item.key}"]`);
    const fresh = renderCard(item);
    if (old) old.replaceWith(fresh); else list.append(fresh);
    markCurrent();
  }
  function paintAll() {
    refs.clear();
    list.replaceChildren(...draft.items.map(renderCard));
    markCurrent();
  }
  function scrollToCard(item) {
    const el = list.querySelector(`[data-key="${item.key}"]`);
    el?.scrollIntoView({ behavior: motionOK() ? 'smooth' : 'auto', block: 'start' });
  }
  function focusCard(item) {
    scrollToCard(item);
    list.querySelector(`[data-key="${item.key}"] input`)?.focus({ preventScroll: true });
  }

  // ───── Trocar exercício (mesmo músculo/porção) ─────
  const targetOf = (item) => ({
    exerciseId: item.exerciseId, group: item.group, portion: item.portion, type: item.type, equipment: item.equipment,
  });

  /**
   * Troca o exercício. Se já houver séries registradas, elas permanecem no exercício
   * original (que fica como concluído) e o substituto recebe só as séries que faltavam.
   */
  function applySwap(item, ex, alsoPlan) {
    const doneSets = item.sets.filter((s) => s.done);
    let target = item;
    if (doneSets.length) {
      const pending = Math.max(1, item.sets.length - doneSets.length);
      target = {
        ...structuredClone(item), key: uid(), note: '', doneAt: 0,
        planned: { ...item.planned, sets: pending },
        sets: Array.from({ length: pending }, () => ({ weight: '', reps: '', done: false })),
      };
      item.sets = doneSets;
      item.planItemId = ''; // o vínculo com a ficha passa para o substituto
      draft.items.splice(draft.items.indexOf(item) + 1, 0, target);
    }
    target.exerciseId = ex.id; target.name = ex.name; target.group = ex.group; target.type = ex.type;
    target.portion = ex.portion; target.equipment = ex.equipment; target.planNote = '';
    target.sets.forEach((s) => { s.weight = ''; s.reps = ''; });
    if (alsoPlan && target.planItemId) { // alteração PERMANENTE: só com autorização explícita
      const p = structuredClone(getPlan());
      const pi = p.days.find((d) => d.id === draft.dayId)?.items.find((i) => i.id === target.planItemId);
      if (pi) { pi.exerciseId = ex.id; pi.note = ''; savePlan(p); }
    }
    persist();
    if (doneSets.length) { paintAll(); scrollToCard(target); } else repaintCard(target);
    updateProgress();
    const where = alsoPlan ? ' (e na ficha)' : ' (só neste treino)';
    toast(`Trocado por ${ex.name}${where}.${doneSets.length ? ' As séries já feitas foram mantidas.' : ''}`);
    announce(`Exercício trocado por ${ex.name}.`);
  }

  function altButtons(item, alts, alsoPlanInput, close) {
    return h('ul', { class: 'pick' }, alts.map(({ exercise: ex, reasons }) => h('li', {},
      h('button', {
        type: 'button', class: 'list-item',
        onClick: () => { applySwap(item, ex, Boolean(alsoPlanInput?.checked)); close(); },
      },
      h('span', { class: 'grow' },
        h('span', { class: 'title' }, ex.name), h('br'),
        h('span', { class: 'meta' }, reasons.join(' · ')))))));
  }

  function openSwap(item) {
    const hasDone = item.sets.some((s) => s.done);
    const used = new Set(draft.items.map((i) => i.exerciseId));
    const alts = rankAlternatives(targetOf(item), getAllExercises(), { exclude: used, unavailable, limit: 8 });
    const alsoPlan = h('input', { type: 'checkbox', id: 'swap-plan' });
    let handle;
    const body = h('div', { class: 'stack' },
      h('p', { class: 'muted' }, `Alternativas para ${GROUPS[item.group]} (${item.portion || 'geral'}), da melhor para a menos equivalente.`),
      hasDone ? h('p', { class: 'swap-note' }, 'As séries que você já registrou ficam salvas em ' + item.name + '. O novo exercício assume só as séries que faltam.') : null,
      alts.length ? altButtons(item, alts, alsoPlan, () => handle.close()) : h('p', {}, 'Nenhuma alternativa disponível com os equipamentos atuais. Em Ajustes você pode rever os equipamentos disponíveis.'),
      item.planItemId ? h('label', { class: 'check', for: 'swap-plan' }, alsoPlan, h('span', {}, `Aplicar também à ficha de ${day.name} (permanente)`)) : null);
    handle = modal({ title: `Trocar ${item.name}`, body, actions: [{ label: 'Cancelar', kind: 'ghost' }] });
  }

  // ───── Máquina ocupada ─────
  function moveItem(from, toIndex) {
    const [it] = draft.items.splice(from, 1);
    draft.items.splice(toIndex, 0, it);
  }

  function openBusy(item) {
    const idx = draft.items.indexOf(item);
    const { next, lastGroup } = suggestBusy(draft.items, idx);
    const used = new Set(draft.items.map((i) => i.exerciseId));
    const alts = rankAlternatives(targetOf(item), getAllExercises(), { exclude: used, unavailable, avoidSameEquipment: true, limit: 3 });
    let handle;
    const body = h('div', { class: 'stack' },
      h('p', { class: 'muted' }, `Aparelho de "${item.name}" ocupado. Escolha como seguir — a ficha não será alterada.`),
      lastGroup ? h('p', { class: 'hint' }, `Último músculo trabalhado: ${GROUPS[lastGroup]}.`) : null);

    if (next) {
      body.append(h('h3', {}, 'Fazer outro exercício agora'),
        h('button', {
          type: 'button', class: 'list-item',
          onClick: () => {
            const ni = draft.items.indexOf(next.item);
            moveItem(draft.items.indexOf(item), ni); // o ocupado volta logo depois do próximo
            persist(); paintAll(); handle.close();
            toast(`Siga com ${next.item.name}; ${item.name} fica para depois.`);
            focusCard(next.item);
          },
        }, h('span', { class: 'grow' },
          h('span', { class: 'title' }, next.item.name), h('br'),
          h('span', { class: 'meta' }, next.reason))));
    } else {
      body.append(h('p', {}, 'Não há outros exercícios pendentes neste treino.'));
    }

    if (alts.length) {
      body.append(h('h3', {}, 'Ou trocar por equivalente (mesma porção)'),
        altButtons(item, alts, null, () => handle.close()));
    }
    body.append(h('button', {
      type: 'button', class: 'btn',
      onClick: () => { moveItem(draft.items.indexOf(item), draft.items.length - 1); persist(); paintAll(); handle.close(); toast(`${item.name} movido para o final.`); },
    }, 'Deixar para o final'));

    handle = modal({ title: 'Máquina ocupada', body, actions: [{ label: 'Cancelar', kind: 'ghost' }] });
  }

  function openInfo(item) {
    const ex = getExercise(item.exerciseId);
    modal({
      title: item.name,
      body: h('div', { class: 'stack' },
        h('div', { class: 'row wrap' },
          h('span', { class: 'tag' }, GROUPS[item.group]),
          item.portion ? h('span', { class: 'tag' }, item.portion) : null,
          h('span', { class: 'tag' }, EQUIPMENT[item.equipment] ?? '')),
        h('p', {}, ex?.how || 'Sem instruções cadastradas.'),
        h('p', { class: 'hint' }, 'Em caso de dor, interrompa o exercício. Orientação básica; não substitui acompanhamento profissional.')),
      actions: [{ label: 'Fechar', kind: 'primary' }],
    });
  }

  // ───── Finalizar / descartar ─────
  async function discard() {
    const ok = await confirmDialog({
      title: 'Descartar este treino?', message: 'Todas as séries registradas agora serão perdidas.',
      confirmLabel: 'Descartar', danger: true,
    });
    if (!ok) return;
    closed = true;
    persist.cancel(); clearDraft(); stopRest();
    toast('Treino descartado.');
    navigate('/');
  }

  /** Tela de conclusão: duração, volume, exercícios e recordes. */
  function showSummary(session) {
    const stats = sessionStats(session);
    const records = findRecords(session, getSessions());
    const before = getSessions().find((x) => x.id !== session.id && x.dayId === session.dayId
      && (x.date < session.date || (x.date === session.date && x.startedAt < session.startedAt)));
    const beforeVolume = before ? sessionStats(before).volume : 0;
    const diff = before && beforeVolume > 0 ? ((stats.volume - beforeVolume) / beforeVolume) * 100 : null;
    let left = false;
    const go = (path) => { if (!left) { left = true; navigate(path); } };

    const stat = (value, label) => h('div', { class: 'stat' }, h('div', { class: 'v' }, value), h('div', { class: 'k' }, label));
    const body = h('div', { class: 'stack' },
      h('div', { class: 'summary-hero' },
        h('span', { class: 'badge-ring', 'aria-hidden': 'true' }, icon('check')),
        h('p', { class: 'muted' }, `${session.title} · ${fmtDateShort(session.date)}`)),
      h('div', { class: 'summary-grid' },
        stat(fmtDuration(stats.minutes), 'duração'),
        stat(`${fmtNum(stats.volume, 0)} kg`, 'volume total'),
        stat(String(stats.sets), 'séries'),
        stat(String(stats.exercises), 'exercícios')),
      diff === null ? null : h('p', { class: 'muted small' },
        `Volume ${diff >= 0 ? '▲ +' : '▼ −'}${fmtNum(Math.abs(diff), 1)}% em relação ao treino anterior (${fmtDateShort(before.date)}).`),
      records.length
        ? h('div', { class: 'stack' },
          h('h3', {}, records.length === 1 ? '1 recorde' : `${records.length} recordes`),
          h('div', { class: 'record-list' }, records.map((rc) => h('div', { class: 'record-item' },
            icon('trophy'),
            h('span', {}, h('strong', {}, rc.name),
              h('small', {}, `${RECORD_TEXT[rc.kind]}: ${fmtNum(rc.value)} ${rc.kind === 'reps' ? 'reps' : 'kg'} (antes: ${fmtNum(rc.previous)})`))))))
        : h('p', { class: 'hint' }, 'Sem recordes desta vez — consistência também é progresso.'));

    haptic(records.length ? 'record' : 'finish');
    announce(`Treino concluído em ${fmtDuration(stats.minutes)}. Volume ${fmtNum(stats.volume, 0)} quilos, ${stats.sets} séries${records.length ? `, ${records.length} recorde${records.length > 1 ? 's' : ''}` : ''}.`);
    modal({
      title: 'Treino concluído!',
      body,
      actions: [
        { label: 'Ir para o início', kind: 'ghost', onClick: () => go('/') },
        { label: 'Ver detalhes', kind: 'primary', onClick: () => go(`/historico/${session.id}`) },
      ],
      onClose: () => go(`/historico/${session.id}`), // Esc / toque fora: segue para o treino salvo
    });
  }

  async function finish() {
    if (finishing) return;
    persist.flush();
    const items = activeItems().map((it) => ({
      exerciseId: it.exerciseId, name: it.name, group: it.group, note: it.note, planned: it.planned,
      sets: it.sets.filter((s) => s.done).map((s) => ({ weight: Number(s.weight), reps: Number(s.reps) })),
    })).filter((it) => it.sets.length);

    if (!items.length) {
      const ok = await confirmDialog({
        title: 'Nenhuma série registrada', message: 'Não há nada para salvar. Descartar este treino?',
        confirmLabel: 'Descartar', danger: true,
      });
      if (ok) { closed = true; persist.cancel(); clearDraft(); stopRest(); navigate('/'); }
      return;
    }
    const { total, done } = totals();
    if (done < total) { // com tudo feito, não há o que perguntar: um toque finaliza
      const ok = await confirmDialog({
        title: 'Finalizar treino?',
        message: `${done} séries registradas. As ${total - done} não feitas serão ignoradas.`,
        confirmLabel: 'Finalizar',
      });
      if (!ok) return;
    }
    finishing = true;
    const session = addSession({
      date: draft.date, dayId: draft.dayId, title: draft.title,
      startedAt: draft.startedAt, endedAt: Date.now(), note: draft.note, items,
    });
    closed = true;
    persist.cancel(); clearDraft(); stopRest();
    showSummary(session);
  }

  // ───── Montagem ─────
  const list = h('div', { class: 'stack' });
  const finishBtn = h('button', { type: 'button', class: 'btn primary block cta', onClick: finish }, icon('check'), 'Finalizar treino');
  const root = h('div', { class: 'view' },
    pageHead(day.title, { subtitle: `${day.name} · rascunho salvo automaticamente`, back: '#/' }),
    h('div', { class: 'stack' },
      h('div', { class: 'row between' },
        progressText,
        h('button', {
          type: 'button', class: 'btn small ghost',
          'aria-label': 'Iniciar descanso manual',
          onClick: () => { startRest(settings.restIsolation, 'Descanso'); haptic('tap'); announce(`Descanso de ${fmtClock(settings.restIsolation)} iniciado.`); },
        }, icon('timer'), 'Descanso')),
      progressBar),
    list,
    h('div', { class: 'field' },
      h('label', { for: 'sess-note' }, 'Observações do treino'),
      h('textarea', {
        id: 'sess-note', class: 'input', maxlength: '500', value: draft.note,
        placeholder: 'Opcional: sono, energia, dores…',
        onInput: (e) => { draft.note = e.target.value; persist(); },
      })),
    finishBtn,
    h('button', { type: 'button', class: 'btn danger block', onClick: discard }, 'Descartar treino'));

  paintAll();
  updateProgress();
  { // barra cresce de 0 até o progresso salvo (rascunho retomado)
    const { total, done } = totals();
    growBar(progressFill, total ? (done / total) * 100 : 0);
  }

  // Tela ligada durante o treino (opcional em Ajustes).
  let lock = null;
  const acquire = async () => {
    if (!settings.keepAwake || !navigator.wakeLock || document.visibilityState !== 'visible') return;
    try {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
    } catch { /* sem suporte/permissão: segue normalmente */ }
  };
  const onVisibility = () => {
    if (document.visibilityState === 'visible') { if (!lock) acquire(); } else persist.flush();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', persist.flush);
  acquire();

  return {
    el: root,
    title: day.title,
    live: false, // não redesenhar por mudanças remotas durante o treino
    destroy() {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', persist.flush);
      persist.flush();
      lock?.release?.();
    },
  };
}
