/**
 * FORJA — Ajustes: preferências, equipamentos, backup (com criptografia opcional),
 * conta/sincronização e privacidade (exclusão de dados).
 */
import { h, icon, isoDate, fmtDateFull } from '../utils.js';
import {
  getState, getSettings, updateSettings, importMerge, importReplace, wipeLocalData,
  loadDraft, saveDraft, isDemoMode, getDemoInfo, enableDemoMode, disableDemoMode, buildDemoExport,
} from '../store.js';
import { EQUIPMENT } from '../data/library.js';
import { buildDefaultPlan } from '../data/plan.js';
import { validateBackup, DEFAULT_SETTINGS } from '../validate.js';
import {
  buildBackup, encryptBackup, decryptBackup, isEncryptedBackup, downloadJSON, readBackupFile,
} from '../backup.js';
import {
  isConfigured, getUser, signIn, signOut, syncNow, getSyncInfo, onSyncChange,
  queueLocalDataForUpload, wasMigrationHandled, setMigrationHandled, deleteCloudData,
} from '../sync.js';
import { APP_VERSION } from '../version.js';
import { convertLegacySnapshot, isLegacyBackup } from '../legacy.js';
import { pageHead, modal, confirmDialog, toast, field, banner } from '../ui.js';
import { haptic } from '../feedback.js';

const STATUS_TEXT = {
  idle: 'Sincronizado', syncing: 'Sincronizando…', offline: 'Offline — será sincronizado ao reconectar',
  error: 'Falha ao sincronizar', 'signed-out': 'Desconectado', disabled: 'Desativado',
};

/** Confirmação "digite a palavra" para ações irreversíveis. */
function typedConfirm({ title, message, word, confirmLabel }) {
  return new Promise((resolve) => {
    let ok = false;
    const input = h('input', { class: 'input', type: 'text', autocomplete: 'off', autocapitalize: 'characters', 'aria-label': `Digite ${word} para confirmar` });
    const m = modal({
      title,
      body: h('div', { class: 'stack' }, h('p', {}, message), h('p', {}, 'Digite ', h('strong', {}, word), ' para confirmar:'), input),
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: confirmLabel, kind: 'danger', onClick: () => {
          if (input.value.trim().toUpperCase() !== word) { input.setAttribute('aria-invalid', 'true'); input.focus(); return false; }
          ok = true; return true;
        } },
      ],
      onClose: () => resolve(ok),
    });
    return m;
  });
}

export function render({ rerender }) {
  const s = getSettings();
  const root = h('div', { class: 'view' }, pageHead('Ajustes'));
  const unsub = [];

  // ───────────── Preferências ─────────────
  const secInput = (id, label, key) => {
    const input = h('input', {
      class: 'input', type: 'text', inputmode: 'numeric', maxlength: '3', value: String(s[key]),
      onChange: (e) => {
        const v = /^\d{1,3}$/.test(e.target.value.trim()) ? Number(e.target.value) : NaN;
        if (!(v >= 15 && v <= 900)) { e.target.setAttribute('aria-invalid', 'true'); toast('Informe um valor entre 15 e 900 segundos.', { error: true }); return; }
        e.target.removeAttribute('aria-invalid');
        updateSettings({ [key]: v });
      },
    });
    return field({ label, id, control: input, hint: 'Entre 15 e 900 segundos.' });
  };
  const toggle = (label, key, hint) => h('label', { class: 'check' },
    h('input', { type: 'checkbox', checked: s[key], onChange: (e) => updateSettings({ [key]: e.target.checked }) }),
    h('span', {}, label, hint ? h('span', { class: 'hint' }, ' ', hint) : null));

  root.append(h('section', { class: 'card', 'aria-labelledby': 'sec-pref' },
    h('h2', { id: 'sec-pref' }, 'Treino'),
    secInput('rest-comp', 'Descanso em exercícios compostos (s)', 'restCompound'),
    secInput('rest-iso', 'Descanso em isoladores (s)', 'restIsolation'),
    toggle('Manter a tela ligada durante o treino', 'keepAwake'),
    toggle('Vibrar ao fim do descanso', 'vibrate'),
    toggle('Tocar bipe ao fim do descanso', 'sound')));

  // ───────────── Equipamentos ─────────────
  root.append(h('section', { class: 'card', 'aria-labelledby': 'sec-eq' },
    h('h2', { id: 'sec-eq' }, 'Equipamentos disponíveis'),
    h('p', { class: 'hint' }, 'Desmarque o que sua academia não tem: esses exercícios deixam de ser sugeridos como troca.'),
    ...Object.entries(EQUIPMENT).map(([k, label]) => h('label', { class: 'check' },
      h('input', {
        type: 'checkbox', checked: !s.unavailableEquipment.includes(k),
        onChange: (e) => {
          const cur = new Set(getSettings().unavailableEquipment);
          if (e.target.checked) cur.delete(k); else cur.add(k);
          updateSettings({ unavailableEquipment: [...cur] });
        },
      }), h('span', {}, label)))));

  // ───────────── Backup ─────────────
  async function doExport() {
    const pass = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', minlength: '8', maxlength: '128' });
    const err = h('p', { class: 'error-text', role: 'alert' });
    modal({
      title: 'Exportar backup',
      body: h('div', { class: 'stack' },
        h('p', {}, 'O arquivo contém seu histórico de treinos. Recomendamos protegê-lo com uma senha.'),
        field({ label: 'Senha (opcional)', id: 'bk-pass', control: pass, hint: 'Mínimo de 8 caracteres. Sem a senha não é possível abrir o backup — guarde-a em local seguro.' }),
        err),
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Exportar', kind: 'primary', onClick: async () => {
          const p = pass.value;
          if (p && p.length < 8) { err.textContent = 'A senha precisa ter pelo menos 8 caracteres.'; pass.focus(); return false; }
          try {
            const backup = buildBackup(getState());
            const out = p ? await encryptBackup(backup, p) : backup;
            downloadJSON(`forja-backup-${isoDate()}${p ? '-protegido' : ''}.json`, out);
            toast('Backup exportado.');
          } catch { err.textContent = 'Não foi possível gerar o backup.'; return false; }
          return true;
        } },
      ],
    });
  }

  async function askPassword() {
    return new Promise((resolve) => {
      let value = null;
      const pass = h('input', { class: 'input', type: 'password', autocomplete: 'off', maxlength: '128' });
      modal({
        title: 'Backup protegido',
        body: field({ label: 'Senha do backup', id: 'imp-pass', control: pass }),
        actions: [
          { label: 'Cancelar', kind: 'ghost' },
          { label: 'Abrir', kind: 'primary', onClick: () => { if (!pass.value) { pass.focus(); return false; } value = pass.value; return true; } },
        ],
        onClose: () => resolve(value),
      });
    });
  }

  async function doImport(file) {
    try {
      let raw = await readBackupFile(file);
      if (isEncryptedBackup(raw)) {
        const pw = await askPassword();
        if (pw === null) return;
        raw = await decryptBackup(raw, pw);
      }
      const isLegacy = isLegacyBackup(raw);
      let legacyDraft = null;
      let clean;
      let dropped;
      if (isLegacy) {
        const converted = convertLegacySnapshot(raw.workouts, raw.activeSession);
        legacyDraft = converted.draft;
        ({ state: clean, dropped } = validateBackup({
          app: 'forja', format: 1,
          data: {
            plan: buildDefaultPlan(), settings: DEFAULT_SETTINGS,
            customExercises: converted.customExercises, sessions: converted.sessions,
          },
        }, buildDefaultPlan));
      } else {
        ({ state: clean, dropped } = validateBackup(raw, buildDefaultPlan));
      }
      const summary = `${clean.sessions.length} treinos e ${clean.customExercises.length} exercícios personalizados${dropped ? ` (${dropped} itens inválidos ignorados)` : ''}.`;

      if (isLegacy) {
        modal({
          title: 'Backup antigo do FORJA',
          body: h('div', { class: 'stack' },
            h('p', {}, 'Encontramos ', h('strong', {}, summary)),
            h('p', { class: 'hint' }, 'Os treinos serão convertidos e mesclados ao seu histórico atual. Sua ficha e suas preferências serão mantidas.'),
            legacyDraft ? h('p', { class: 'hint' }, 'O arquivo também contém um treino em andamento. Ele será restaurado se não houver outro treino em andamento neste aparelho.') : null),
          actions: [
            { label: 'Cancelar', kind: 'ghost' },
            { label: 'Mesclar treinos', kind: 'primary', onClick: () => {
              const current = getState();
              const n = importMerge({ ...clean, plan: current.plan, settings: current.settings });
              let restored = false;
              if (legacyDraft && !loadDraft()) { saveDraft(legacyDraft); restored = true; }
              toast(`Backup convertido e mesclado (${n} registros${restored ? ', treino em andamento restaurado' : ''}).`);
              rerender();
            } },
          ],
        });
        return;
      }

      modal({
        title: 'Importar backup',
        body: h('div', { class: 'stack' },
          h('p', {}, 'O arquivo contém ', h('strong', {}, summary)),
          h('p', { class: 'hint' }, 'Mesclar mantém seus dados atuais e adiciona/atualiza com o backup (o registro mais recente prevalece). Substituir apaga o que não estiver no backup. Uma cópia de segurança interna é criada antes.')),
        actions: [
          { label: 'Cancelar', kind: 'ghost' },
          { label: 'Substituir tudo', kind: 'danger', onClick: async () => {
            const ok = await confirmDialog({ title: 'Substituir todos os dados?', message: 'Treinos e exercícios que não estiverem no backup serão removidos.', confirmLabel: 'Substituir', danger: true });
            if (!ok) return false;
            importReplace(clean); toast('Backup restaurado.'); rerender(); return true;
          } },
          { label: 'Mesclar', kind: 'primary', onClick: () => { const n = importMerge(clean); toast(`Backup mesclado (${n} registros atualizados).`); rerender(); } },
        ],
      });
    } catch (e) {
      toast(e.message || 'Não foi possível importar o arquivo.', { error: true });
    }
  }

  const fileInput = h('input', {
    type: 'file', class: 'sr-only', id: 'imp-file', accept: 'application/json,.json', tabindex: '-1',
    onChange: (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) doImport(f); },
  });
  root.append(h('section', { class: 'card', 'aria-labelledby': 'sec-bk' },
    h('h2', { id: 'sec-bk' }, 'Backup'),
    h('p', { class: 'hint' }, 'Guarde uma cópia dos seus dados para trocar de aparelho ou se algo der errado.'),
    h('div', { class: 'row wrap' },
      h('button', { type: 'button', class: 'btn', onClick: doExport }, 'Exportar'),
      h('button', { type: 'button', class: 'btn', onClick: () => fileInput.click() }, 'Importar')),
    fileInput));

  // ───────────── Conta e sincronização ─────────────
  root.append(accountSection());

  function accountSection() {
    const sec = h('section', { class: 'card', 'aria-labelledby': 'sec-acc' }, h('h2', { id: 'sec-acc' }, 'Conta e sincronização'));
    if (!isConfigured()) {
      sec.append(h('p', { class: 'muted' }, 'A sincronização na nuvem está desativada. O app funciona 100% neste aparelho, inclusive offline. Para ativar, siga o guia no README.'));
      return sec;
    }
    const user = getUser();
    if (!user) {
      const email = h('input', { class: 'input', type: 'email', autocomplete: 'username', required: true, maxlength: '254', inputmode: 'email' });
      const pass = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', required: true, maxlength: '128' });
      const err = h('p', { class: 'error-text', role: 'alert' });
      const submit = h('button', { type: 'submit', class: 'btn primary' }, 'Entrar');
      sec.append(h('form', {
        class: 'stack',
        onSubmit: async (ev) => {
          ev.preventDefault();
          err.textContent = '';
          submit.disabled = true;
          try {
            await signIn(email.value.trim(), pass.value);
            pass.value = '';
            // Migração dos dados locais para a conta — somente com autorização.
            if (!wasMigrationHandled()) {
              const send = await confirmDialog({
                title: 'Enviar dados deste aparelho para sua conta?',
                message: 'Seus treinos e sua ficha salvos neste aparelho serão copiados para a nuvem e ficarão disponíveis em outros aparelhos. Dados já existentes na conta são mantidos (o mais recente prevalece).',
                confirmLabel: 'Enviar', cancelLabel: 'Agora não',
              });
              if (send) queueLocalDataForUpload(); else setMigrationHandled();
            }
            syncNow();
            rerender();
          } catch (e) {
            err.textContent = e.message;
          } finally { submit.disabled = false; }
        },
      },
      field({ label: 'E-mail', id: 'acc-email', control: email }),
      field({ label: 'Senha', id: 'acc-pass', control: pass }),
      err, submit,
      h('p', { class: 'hint' }, 'Não há cadastro aberto: as contas são criadas pelo administrador.')));
      return sec;
    }

    const statusEl = h('strong', {});
    const detailEl = h('span', { class: 'hint' });
    const paint = (info) => {
      statusEl.textContent = STATUS_TEXT[info.status] ?? '';
      detailEl.textContent = [
        info.lastSyncAt ? `Última: ${new Date(info.lastSyncAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : '',
        info.pending ? `${info.pending} alteração(ões) pendente(s)` : '',
        info.lastError,
      ].filter(Boolean).join(' · ');
    };
    paint(getSyncInfo());
    unsub.push(onSyncChange(paint));

    sec.append(
      h('p', {}, 'Conectado como ', h('strong', {}, user.email)),
      h('p', { role: 'status' }, statusEl, ' ', detailEl),
      h('div', { class: 'row wrap' },
        h('button', { type: 'button', class: 'btn', onClick: () => syncNow() }, 'Sincronizar agora'),
        h('button', {
          type: 'button', class: 'btn',
          onClick: async () => {
            const ok = await confirmDialog({ title: 'Enviar todos os dados deste aparelho?', message: 'Copia tudo o que está aqui para a sua conta (o registro mais recente prevalece).', confirmLabel: 'Enviar' });
            if (ok) { queueLocalDataForUpload(); syncNow(); toast('Envio iniciado.'); }
          },
        }, 'Enviar dados locais'),
        h('button', {
          type: 'button', class: 'btn ghost',
          onClick: async () => { await signOut(); toast('Você saiu da conta. Os dados continuam neste aparelho.'); rerender(); },
        }, 'Sair')),
      h('button', {
        type: 'button', class: 'link-btn',
        onClick: async () => {
          const ok = await typedConfirm({
            title: 'Excluir dados da nuvem?',
            message: 'Remove da nuvem todo o histórico, ficha e configurações da sua conta. Os dados deste aparelho não são apagados.',
            word: 'EXCLUIR', confirmLabel: 'Excluir da nuvem',
          });
          if (!ok) return;
          try { await deleteCloudData(); toast('Dados da nuvem excluídos.'); } catch (e) { toast(e.message, { error: true }); }
        },
      }, 'Excluir meus dados da nuvem'));
    return sec;
  }

  // ───────────── Privacidade ─────────────
  root.append(h('section', { class: 'card', 'aria-labelledby': 'sec-priv' },
    h('h2', { id: 'sec-priv' }, 'Privacidade e dados'),
    h('p', { class: 'hint' }, 'Seus dados ficam apenas neste aparelho (e na sua conta, se você ativar a sincronização). Não há anúncios, rastreadores nem serviços de análise.'),
    h('button', {
      type: 'button', class: 'btn danger',
      onClick: async () => {
        const ok = await typedConfirm({
          title: 'Apagar todos os dados deste aparelho?',
          message: 'Remove treinos, ficha, configurações e sessão de login deste aparelho. Dados na nuvem (se houver) não são afetados. Considere exportar um backup antes.',
          word: 'APAGAR', confirmLabel: 'Apagar tudo',
        });
        if (!ok) return;
        wipeLocalData();
        toast('Dados apagados deste aparelho.');
        location.hash = '#/';
        location.reload();
      },
    }, icon('trash'), 'Apagar dados deste aparelho')));

  // ───────────── Modo desenvolvedor (dados de teste) ─────────────
  root.append(devSection());

  function devSection() {
    const info = getDemoInfo();
    let weeks = info.on ? info.weeks : 12;
    const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Período do histórico simulado' });
    const paintChips = () => chips.replaceChildren(...[4, 12, 24].map((n) => h('button', {
      type: 'button', class: 'chip', 'aria-pressed': String(weeks === n),
      onClick: () => { weeks = n; paintChips(); },
    }, `${n} semanas`)));
    paintChips();

    const toggle = h('input', {
      type: 'checkbox', checked: info.on,
      onChange: async (e) => {
        if (e.target.checked) {
          e.target.checked = false; // só liga depois da confirmação
          const ok = await confirmDialog({
            title: 'Ligar o modo de teste?',
            message: `Serão gerados treinos FICTÍCIOS de ${weeks} semanas para você testar gráficos, recordes e sugestões. Eles ficam separados dos seus dados reais: não entram no backup nem na sincronização, não alteram nada do que você registrou e somem ao desligar o modo.`,
            confirmLabel: 'Ligar modo de teste',
          });
          if (!ok) return;
          if (!enableDemoMode({ weeks })) { toast('Não foi possível guardar os dados de teste (armazenamento cheio).', { error: true }); return; }
          haptic('done'); toast('Modo de teste ligado.');
        } else {
          disableDemoMode(); haptic('tap'); toast('Modo de teste desligado. Dados simulados removidos.');
        }
        rerender();
      },
    });

    const sec = h('details', { class: 'card dev-card', open: info.on ? true : null },
      h('summary', {}, icon('flask'), ' Modo desenvolvedor'),
      h('p', { class: 'hint' }, 'Para testar o app como se você já tivesse treinado por semanas. Os dados simulados ficam isolados dos reais e são identificados com a etiqueta “Teste”.'),
      h('label', { class: 'check' }, toggle, h('span', {}, 'Dados de teste',
        h('span', { class: 'hint' }, info.on ? ` ligado — ${info.count} treinos simulados` : ' desligado'))),
      h('div', { class: 'field' }, h('span', { class: 'label', id: 'dev-weeks' }, 'Tamanho do histórico simulado'), chips));

    if (info.on) {
      sec.append(h('div', { class: 'row wrap' },
        h('button', {
          type: 'button', class: 'btn',
          onClick: () => { enableDemoMode({ weeks }); haptic('done'); toast('Novo histórico de teste gerado.'); rerender(); },
        }, 'Gerar novos dados'),
        h('button', {
          type: 'button', class: 'btn',
          onClick: () => { downloadJSON(`forja-dados-teste-${isoDate()}.json`, buildDemoExport()); toast('Dados de teste exportados para análise em Python.'); },
        }, 'Exportar dados de teste')),
      h('p', { class: 'hint' }, 'O arquivo exportado usa um formato próprio e não pode ser importado como backup. Use-o com scripts/analyze.py (veja o README).'));
    }
    return sec;
  }

  // ───────────── Sobre ─────────────
  root.append(banner('',
    h('strong', {}, `FORJA ${APP_VERSION}`),
    h('p', { class: 'muted small' }, 'Diário de treino para hipertrofia. As recomendações do app são sugestões baseadas nos seus registros e não substituem a orientação de um profissional de educação física ou de saúde.'),
    h('p', { class: 'muted small' }, `Hoje: ${fmtDateFull(isoDate())}`)));

  return { el: root, title: 'Ajustes', destroy: () => unsub.forEach((f) => f()) };
}
