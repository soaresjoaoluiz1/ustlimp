# Integração: LP Ustulimp → Planilha → CRM Dros + Meta Pixel

## Fluxo completo

```
[Visitante clica Enviar]
        │
        ▼
[Meta Pixel dispara 'Lead']
        │
        ▼
[POST no-cors → Apps Script (fire-and-forget)]
        │
        ├──▶ [Apps Script escreve linha na planilha "LP REVENDEDOR"]
        │
        ├──▶ [Apps Script chama POST /api/webhooks/sheets/ustulimp-...]
        │           │
        │           ▼
        │    [CRM Dros cria lead na conta Ustulimp, aplica tag "LP Revendedor"/"LP Lojista"]
        │
        ▼
[Redirect → /obrigado.html?msg=...&to=...&perfil=...]
        │
        ▼
[Pixel dispara 'Lead' + 'CompleteRegistration' (2ª camada de segurança)]
        │
        ▼
[Auto-abre WhatsApp em 1.2s com msg pré-preenchida]
```

## Setup — passo a passo (uma vez só)

### 1. Publicar Apps Script

1. Abrir a planilha: https://docs.google.com/spreadsheets/d/1A26fTciavtuj57TTC-uCxfnMZaBwZzU30jDe4CE6zbc/edit
2. Menu **Extensões → Apps Script**
3. Apagar o `Code.gs` vazio, colar o conteúdo de [`apps-script.gs`](apps-script.gs), salvar (Ctrl+S)
4. Clicar em **Implantar → Nova implantação**
5. Ícone de engrenagem → **Tipo: App da Web**
6. Configurar:
   - Descrição: `Ustulimp LP webhook v1`
   - Executar como: **Eu (agenciadouc@gmail.com)**
   - Quem tem acesso: **Qualquer pessoa**
7. Clicar **Implantar** → autorizar quando pedir (aceita permissão de Planilha + URL Fetch)
8. Copiar a **URL do App da Web** (formato: `https://script.google.com/macros/s/AKfy.../exec`)

### 2. Colar a URL no HTML da LP

Editar `ustulimp-lp/index.html`, linha `const APPS_SCRIPT_URL = "..."`, trocar o placeholder pela URL real. Commit + push + `git pull` na VPS.

### 3. Ajustar número de WhatsApp

Mesma linha, `const WHATSAPP = "5514..."` — trocar pelo WhatsApp comercial real da Marcela.

### 4. Testar end-to-end

1. Abrir https://revendedor.ustulimp.com.br/?utm_source=teste&utm_medium=email&utm_campaign=setup
2. Rolar até o formulário, preencher com dados de teste (CPF válido, WhatsApp qualquer)
3. Enviar
4. Verificar:
   - Página `/obrigado.html` abre com o botão WhatsApp
   - Planilha `LP REVENDEDOR` recebe uma nova linha com todos os campos + UTMs + `CRM sync status = ok`
   - No CRM (https://drosagencia.com.br/crm), conta Ustulimp, novo lead aparece com tag "LP Revendedor"
   - No **Events Manager do Meta** (https://business.facebook.com/events_manager2), Pixel `3598380517000959` mostra eventos `PageView`, `Lead`, `CompleteRegistration`

### 5. Editar Apps Script depois

Se precisar mudar algo no `.gs`:
1. Salvar as mudanças no editor Apps Script
2. **Implantar → Gerenciar implantações** (NÃO "Nova implantação")
3. Editar a existente (ícone lápis) → **Versão: Nova versão** → Implantar
4. A URL `/exec` continua a mesma — não precisa mexer no HTML

Se criar "Nova implantação" em vez de editar, gera URL nova e quebra o form.

## O que é trackeado

**Na planilha (31 colunas):**
Timestamp · Perfil · Nome · WhatsApp · Cidade · CPF · CNPJ · Já revende · Como vende · Tipo estabelecimento · Já vende linha · Source · Source detail · Tags · UTM source/medium/campaign/content/term · fbclid · gclid · fbp · fbc · Referrer · Landing page · Device · Screen · Viewport · User agent · Fill time (ms) · CRM sync status · CRM sync response

**Eventos Meta Pixel:**
- `PageView` — todo carregamento
- `ViewContent` — quando usuário rola até seção "Produtos" (ou após 15s na página)
- `InitiateCheckout` — clique em qualquer CTA "Quero revender"
- `Lead` — submit do form (disparado 2x pra garantir: 1x na LP antes do redirect, 1x na thank you page)
- `CompleteRegistration` — só na thank you page

**No CRM Dros:**
Lead entra na conta Ustulimp (slug `ustulimp-comercio-de-produtos-de-limpeza-ltda`) já etiquetado com "LP Revendedor" ou "LP Lojista", pronto pra distribuição de acordo com as regras da conta.

## Estrutura da conversão pra otimização de campanhas

- Objetivo Meta: **Leads** (com evento `Lead` como conversão)
- Custom Audience: visitantes que dispararam `InitiateCheckout` mas não `Lead` = **retargeting** ideal
- Lookalike: base "Lead" quando tiver 100+ conversões

## Problemas conhecidos

- **fbclid não persiste após 1º clique:** capturamos via URL + sessionStorage. Se o usuário fechar a aba e voltar via link direto, perdemos o fbclid original. Mitigação: cookies `_fbp` e `_fbc` do Meta são capturados também.
- **Apps Script tem limite de 20.000 execuções/dia:** mais que suficiente pro volume esperado.
- **Erro de CORS:** usamos `mode: 'no-cors'` no fetch, então a resposta é opaque (não conseguimos ler). Se o Apps Script falhar, o front não sabe — mas o Meta Pixel `Lead` sobe do mesmo jeito. O status real fica na coluna `CRM sync status` da planilha.
