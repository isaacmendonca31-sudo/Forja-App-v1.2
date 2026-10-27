# Privacidade (LGPD) — resumo de projeto

- **Dados tratados:** histórico de treino, cargas, observações livres (podem conter informação de saúde → dado pessoal sensível), e-mail (só se usar sincronização).
- **Minimização:** sem analytics, anúncios, rastreadores, fontes/CDN externos. Nada sai do aparelho sem login e sincronização ativos.
- **Finalidade e base:** uso pessoal do titular; sincronização mediante ação/consentimento explícito (migração dos dados locais só após confirmação).
- **Direitos do titular:** acesso/portabilidade (exportar JSON), eliminação (apagar local e nuvem), correção (editar).
- **Segurança:** ver `SECURITY.md`. Observações de saúde: evite dados identificáveis de terceiros.
- Este documento não é parecer jurídico.

- **Modo de teste:** os dados simulados são fictícios, ficam só no aparelho em chaves próprias, não entram em backup nem na sincronização e são apagados ao desligar o modo. Uma preferência de interface (`forja:ui:v1`, ex.: dica dispensada) guarda apenas sinalizadores sem dado pessoal.
- **Análise em Python:** `scripts/analyze.py` lê arquivos que você mesmo exportou, localmente; não faz requisições de rede.
