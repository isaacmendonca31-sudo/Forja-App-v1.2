/**
 * FORJA — Configuração da nuvem (opcional).
 *
 * Deixe em branco para usar o app 100% local/offline.
 * Para ativar a sincronização, preencha com os dados do seu projeto Supabase
 * (Project Settings → API):
 *
 *   SUPABASE_URL      ex.: 'https://abcdefghijkl.supabase.co'
 *   SUPABASE_ANON_KEY chave "anon"/"publishable" (é PÚBLICA por design: a
 *                     segurança vem das políticas RLS em supabase/schema.sql)
 *
 * ⚠ NUNCA coloque aqui a chave "service_role" (ou "secret"). Ela ignora o RLS
 *   e daria acesso total ao banco a qualquer pessoa que abrir o app.
 */
export const CONFIG = Object.freeze({
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
});
