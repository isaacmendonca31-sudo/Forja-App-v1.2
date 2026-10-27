/**
 * FORJA — Editor da ficha de treino.
 * Permite alterar exercícios, séries, repetições e ORDEM. Toda edição é feita
 * pelo usuário (o app nunca altera a ficha sozinho) e salva imediatamente.
 *
 * Reordenação por botões ▲/▼ (alternativa acessível ao "arrastar e soltar",
 * que não funciona bem com leitores de tela e teclado).
 */
import { h, icon, uid, normalizeSearch, debounce } from '../utils.js';
import { getPlan, savePlan, resetPlan, getAllExercises, getExercise } from '../store.js';
import { GROUPS, EQUIPMENT } from '../data/library.js';
import { GUIDELINES } from '../data/plan.js';
import { cleanText } from '../validate.js';
import { pageHead, modal, confirmDialog, toast } from '../ui.js';

export function render({ params, navigate, rerender }) {
  const plan0 = getPlan();
  const day0 = plan0.days.find((d) => d.id === params.id);
  if (!day0) {
    return {
      title: 'Dia não encontrado',
      el: h('div', { class: 'view' }, pageHead('Dia não encontrado', { back: '#/' }), h('a', { class: 'btn primary', href: '#/' }, 'Voltar')),
    };
  }
  const dayId = day0.id;

  /** Aplica uma alteração à ficha (cópia → muda → salva → redesenha). */
  function edit(mutator, { focus } = {}) {
    const p = structuredClone(getPlan());
    const d = p.days.find((x) => x.id === dayId);
    mutator(d, p);
    savePlan(p);
    paint();
    if (focus) root.querySelector(`[data-focus="${focus}"]`)?.focus();
  }

  const body = h('div', { class: 'stack' });
  const tabs = h('div', { class: 'chips', role: 'group', 'aria-label': 'Dia da semana' });

  function paint() {
    const plan = getPlan();
    const day = plan.days.find((d) => d.id === dayId);

    tabs.replaceChildren(...plan.days.map((d) => h('a', {
      class: 'chip', href: `#/ficha/${d.id}`, 'aria-current': d.id === dayId ? 'page' : null,
      'aria-label': d.name,
    }, d.name.slice(0, 3))));

    const titleInput = h('input', {
      class: 'input', id: 'day-title', type: 'text', maxlength: '80', value: day.title,
      onChange: (e) => {
        const t = cleanText(e.target.value, 80);
        if (!t) { e.target.value = day.title; return; }
        edit((d) => { d.title = t; }, { focus: 'title' });
      },
    });
    titleInput.dataset.focus = 'title';

    const list = h('ol', { class: 'stack' });
    day.items.forEach((it, i) => {
      const ex = getExercise(it.exerciseId);
      const err = h('p', { class: 'error-text', role: 'alert' });

      // Campo numérico com validação; reverte ao valor anterior se inválido.
      const numField = (label, key, min, max) => {
        const input = h('input', {
          class: 'input', type: 'text', inputmode: 'numeric', maxlength: '3', value: String(it[key]),
          'aria-label': `${label} de ${ex?.name ?? 'exercício'}`,
          onChange: (e) => {
            const v = /^\d{1,3}$/.test(e.target.value.trim()) ? Number(e.target.value) : NaN;
            const next = { ...it, [key]: v };
            if (!(v >= min && v <= max) || next.repMin > next.repMax) {
              err.textContent = key === 'sets'
                ? 'Séries: de 1 a 30.'
                : 'Repetições: de 1 a 100, e o mínimo não pode passar do máximo.';
              e.target.setAttribute('aria-invalid', 'true');
              return;
            }
            edit((d) => { d.items[i][key] = v; });
          },
        });
        return h('div', { class: 'field' }, h('span', { class: 'hint' }, label), input);
      };

      list.append(h('li', {},
        h('div', { class: 'card' },
          h('div', { class: 'card-head' },
            h('h3', {}, `${i + 1}. ${ex?.name ?? 'Exercício removido'}`),
            h('span', { class: 'tag' }, ex ? GROUPS[ex.group] : '')),
          h('div', { class: 'row' }, numField('Séries', 'sets', 1, 30), numField('Reps mín.', 'repMin', 1, 100), numField('Reps máx.', 'repMax', 1, 100)),
          err,
          h('div', { class: 'card-actions' },
            h('button', { type: 'button', class: 'btn small icon-only', 'aria-label': `Mover ${ex?.name ?? 'exercício'} para cima`, disabled: i === 0 ? true : null, 'data-focus': `up-${it.id}`, onClick: () => edit((d) => { [d.items[i - 1], d.items[i]] = [d.items[i], d.items[i - 1]]; }, { focus: `up-${it.id}` }) }, icon('up')),
            h('button', { type: 'button', class: 'btn small icon-only', 'aria-label': `Mover ${ex?.name ?? 'exercício'} para baixo`, disabled: i === day.items.length - 1 ? true : null, 'data-focus': `down-${it.id}`, onClick: () => edit((d) => { [d.items[i + 1], d.items[i]] = [d.items[i], d.items[i + 1]]; }, { focus: `down-${it.id}` }) }, icon('down')),
            h('button', { type: 'button', class: 'btn small', onClick: () => openPicker({ replaceIndex: i }) }, icon('swap'), 'Trocar'),
            h('button', {
              type: 'button', class: 'btn small danger',
              onClick: () => {
                const removed = structuredClone(it);
                edit((d) => { d.items.splice(i, 1); });
                toast(`${ex?.name ?? 'Exercício'} removido da ficha.`, {
                  action: 'Desfazer', timeout: 8000,
                  onAction: () => edit((d) => { d.items.splice(Math.min(i, d.items.length), 0, removed); }),
                });
              },
            }, icon('trash'), 'Remover')))));
    });

    body.replaceChildren(
      h('div', { class: 'field' }, h('label', { for: 'day-title' }, `Nome do treino de ${day.name}`), titleInput),
      day.items.length ? list : h('p', { class: 'muted' }, 'Nenhum exercício neste dia.'),
      h('button', { type: 'button', class: 'btn primary block', onClick: () => openPicker({}) }, icon('plus'), 'Adicionar exercício'));
  }

  /** Seletor de exercício da biblioteca (para adicionar ou trocar). */
  function openPicker({ replaceIndex }) {
    let q = '';
    const results = h('ul', { class: 'pick' });
    let handle;
    const paintResults = () => {
      const n = normalizeSearch(q);
      const items = getAllExercises()
        .filter((e) => !n || normalizeSearch(`${e.name} ${GROUPS[e.group]} ${e.portion}`).includes(n))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).slice(0, 40);
      results.replaceChildren(...items.map((e) => h('li', {},
        h('button', {
          type: 'button', class: 'list-item',
          onClick: () => {
            edit((d) => {
              if (replaceIndex !== undefined) { d.items[replaceIndex].exerciseId = e.id; d.items[replaceIndex].note = ''; }
              else d.items.push({ id: uid(), exerciseId: e.id, sets: 3, repMin: e.type === 'composto' ? 8 : 10, repMax: e.type === 'composto' ? 12 : 15, note: '' });
            });
            handle.close();
            toast(replaceIndex !== undefined ? 'Exercício trocado na ficha.' : 'Exercício adicionado.');
          },
        }, h('span', { class: 'grow' },
          h('span', { class: 'title' }, e.name), h('br'),
          h('span', { class: 'meta' }, `${GROUPS[e.group]} · ${e.portion} · ${EQUIPMENT[e.equipment]}`))))));
      if (!items.length) results.replaceChildren(h('li', { class: 'muted' }, 'Nenhum exercício encontrado.'));
    };
    const search = h('input', {
      type: 'search', class: 'input', maxlength: '60', autocomplete: 'off', 'aria-label': 'Buscar exercício',
      placeholder: 'Buscar exercício…',
      onInput: debounce((e) => { q = e.target.value; paintResults(); }, 150),
    });
    paintResults();
    handle = modal({
      title: replaceIndex !== undefined ? 'Trocar exercício' : 'Adicionar exercício',
      body: h('div', { class: 'stack' }, search, results),
      actions: [{ label: 'Cancelar', kind: 'ghost' }],
    });
  }

  const root = h('div', { class: 'view' },
    pageHead('Ficha de treino', { subtitle: 'Edite exercícios, séries, repetições e ordem. As mudanças valem para os próximos treinos.', back: '#/' }),
    tabs, body,
    h('section', { class: 'card', 'aria-labelledby': 'orient' },
      h('h2', { id: 'orient' }, 'Orientações gerais'),
      h('ul', { class: 'stack' }, GUIDELINES.map(([k, v]) => h('li', {}, h('strong', {}, `${k}: `), v)))),
    h('button', {
      type: 'button', class: 'btn danger block',
      onClick: async () => {
        const ok = await confirmDialog({
          title: 'Restaurar a ficha padrão?',
          message: 'Todas as edições da ficha (todos os dias) serão substituídas pela ficha original. O histórico de treinos não é afetado.',
          confirmLabel: 'Restaurar', danger: true,
        });
        if (ok) { resetPlan(); toast('Ficha padrão restaurada.'); rerender(); }
      },
    }, 'Restaurar ficha padrão'));

  paint();
  return { el: root, title: 'Ficha de treino', live: false };
}
