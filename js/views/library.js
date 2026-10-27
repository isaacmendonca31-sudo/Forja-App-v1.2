/**
 * FORJA — Biblioteca de exercícios: busca, filtro por grupo, detalhes e
 * exercícios personalizados (criar, editar, excluir com "Desfazer").
 */
import { h, icon, normalizeSearch, debounce, parseDecimal } from '../utils.js';
import {
  getAllExercises, getPlan, getSettings, saveExercise, deleteExercise, restoreExercise,
} from '../store.js';
import { GROUPS, EQUIPMENT, TYPES } from '../data/library.js';
import { cleanText, LIMITS } from '../validate.js';
import { pageHead, modal, toast, emptyState, field } from '../ui.js';

export function render() {
  const unavailable = new Set(getSettings().unavailableEquipment);
  let query = '';
  let group = 'todos';
  const list = h('ul', { class: 'list' });
  const count = h('p', { class: 'muted small', role: 'status' });

  function paintList() {
    const q = normalizeSearch(query);
    const items = getAllExercises()
      .filter((e) => (group === 'todos' || e.group === group)
        && (!q || normalizeSearch(`${e.name} ${GROUPS[e.group]} ${e.portion} ${EQUIPMENT[e.equipment]}`).includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    count.textContent = `${items.length} exercício${items.length === 1 ? '' : 's'}`;
    if (!items.length) {
      list.replaceChildren(h('li', {}, emptyState('Nenhum exercício encontrado.')));
      return;
    }
    list.replaceChildren(...items.map((e) => h('li', {},
      h('button', { type: 'button', class: 'list-item', onClick: () => openDetail(e) },
        h('span', { class: 'grow' },
          h('span', { class: 'title' }, e.name), h('br'),
          h('span', { class: 'meta' }, `${GROUPS[e.group]} · ${e.portion} · ${EQUIPMENT[e.equipment]}`)),
        e.custom ? h('span', { class: 'tag' }, 'Seu') : null,
        unavailable.has(e.equipment) ? h('span', { class: 'tag warn' }, 'Indisponível') : null))));
  }

  // ───── Busca e filtros ─────
  const search = h('input', {
    type: 'search', class: 'input', id: 'lib-search', autocomplete: 'off', maxlength: '60',
    placeholder: 'Buscar por nome, músculo ou equipamento',
    onInput: debounce((e) => { query = e.target.value; paintList(); }, 150),
  });
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filtrar por grupo muscular' });
  function paintChips() {
    chips.replaceChildren(...[['todos', 'Todos'], ...Object.entries(GROUPS)].map(([k, label]) => h('button', {
      type: 'button', class: 'chip', 'aria-pressed': String(k === group),
      onClick: () => { group = k; paintChips(); paintList(); },
    }, label)));
  }

  // ───── Detalhe ─────
  function openDetail(e) {
    const usedIn = getPlan().days.filter((d) => d.items.some((i) => i.exerciseId === e.id)).map((d) => d.name);
    const actions = [{ label: 'Fechar', kind: 'primary' }];
    if (e.custom) {
      actions.unshift(
        { label: 'Excluir', kind: 'danger', onClick: () => {
          deleteExercise(e.id); paintList();
          toast('Exercício excluído.', { action: 'Desfazer', timeout: 8000, onAction: () => { restoreExercise(e.id); paintList(); } });
        } },
        { label: 'Editar', kind: 'ghost', onClick: () => { setTimeout(() => openForm(e), 0); } },
      );
    }
    modal({
      title: e.name,
      body: h('div', { class: 'stack' },
        h('div', { class: 'row wrap' },
          h('span', { class: 'tag' }, GROUPS[e.group]),
          h('span', { class: 'tag' }, e.portion),
          h('span', { class: 'tag' }, EQUIPMENT[e.equipment]),
          h('span', { class: 'tag' }, TYPES[e.type])),
        h('p', {}, e.how || 'Sem instruções cadastradas.'),
        h('p', { class: 'hint' }, usedIn.length ? `Na sua ficha: ${usedIn.join(', ')}.` : 'Não está na sua ficha atual.'),
        h('p', { class: 'hint' }, 'Orientação básica de execução; não substitui acompanhamento profissional.')),
      actions,
    });
  }

  // ───── Formulário (criar/editar exercício personalizado) ─────
  function openForm(existing) {
    const sel = (id, opts, value) => h('select', { class: 'input', id },
      Object.entries(opts).map(([k, v]) => h('option', { value: k, selected: k === value ? true : null }, v)));

    const name = h('input', { class: 'input', type: 'text', maxlength: String(LIMITS.name), required: true, autocomplete: 'off', value: existing?.name ?? '' });
    const grp = sel('f-group', GROUPS, existing?.group ?? 'peito');
    const portion = h('input', { class: 'input', type: 'text', maxlength: '40', autocomplete: 'off', placeholder: 'Ex.: superior, lateral, geral', value: existing?.portion === 'geral' ? '' : (existing?.portion ?? '') });
    const equip = sel('f-equip', EQUIPMENT, existing?.equipment ?? 'maquina');
    const type = sel('f-type', TYPES, existing?.type ?? 'isolador');
    const step = h('input', { class: 'input', type: 'text', inputmode: 'decimal', maxlength: '5', autocomplete: 'off', value: String(existing?.step ?? 2.5).replace('.', ',') });
    const how = h('textarea', { class: 'input', maxlength: String(LIMITS.how), value: existing?.how ?? '' });
    const err = h('p', { class: 'error-text', role: 'alert' });
    let handle;

    const form = h('form', {
      class: 'stack', novalidate: true,
      onSubmit: (ev) => {
        ev.preventDefault();
        const n = cleanText(name.value, LIMITS.name);
        const st = parseDecimal(step.value);
        if (!n) { err.textContent = 'Informe o nome do exercício.'; name.setAttribute('aria-invalid', 'true'); name.focus(); return; }
        if (!(st >= 0 && st <= 50)) { err.textContent = 'O salto de carga deve estar entre 0 e 50 kg.'; step.setAttribute('aria-invalid', 'true'); step.focus(); return; }
        saveExercise({
          id: existing?.id, name: n, group: grp.value, portion: cleanText(portion.value, 40) || 'geral',
          equipment: equip.value, type: type.value, step: st, how: cleanText(how.value, LIMITS.how, { multiline: true }),
        });
        paintList(); handle.close(); toast('Exercício salvo.');
      },
    },
    field({ label: 'Nome', id: 'f-name', control: name }),
    field({ label: 'Grupo muscular', id: 'f-group', control: grp }),
    field({ label: 'Porção muscular (opcional)', id: 'f-portion', hint: 'Usada para sugerir trocas equivalentes.', control: portion }),
    field({ label: 'Equipamento', id: 'f-equip', control: equip }),
    field({ label: 'Tipo', id: 'f-type', control: type }),
    field({ label: 'Salto de carga (kg)', id: 'f-step', hint: 'Usado nas sugestões de progressão. 0 = sem carga externa.', control: step }),
    field({ label: 'Instruções (opcional)', id: 'f-how', control: how }),
    err,
    h('div', { class: 'dlg-actions' },
      h('button', { type: 'button', class: 'btn ghost', onClick: () => handle.close() }, 'Cancelar'),
      h('button', { type: 'submit', class: 'btn primary' }, 'Salvar')));

    handle = modal({ title: existing ? 'Editar exercício' : 'Novo exercício', body: form });
  }

  const root = h('div', { class: 'view' },
    pageHead('Biblioteca', {
      subtitle: 'Consulte, pesquise e crie exercícios.',
      actions: h('button', { type: 'button', class: 'btn primary small', onClick: () => openForm(null) }, icon('plus'), 'Novo'),
    }),
    h('div', { class: 'field' }, h('label', { for: 'lib-search', class: 'sr-only' }, 'Buscar exercício'), search),
    chips, count, list);

  paintChips();
  paintList();
  return { el: root, title: 'Biblioteca' };
}
