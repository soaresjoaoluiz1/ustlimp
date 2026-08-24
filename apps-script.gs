/**
 * USTULIMP · LP Revendedor — captura de leads
 * Recebe POST JSON do formulário do site, escreve linha na aba "LP REVENDEDOR"
 * e repassa pro webhook do CRM Dros (conta Ustulimp).
 *
 * Passos pra instalar (uma vez só):
 * 1. Abrir a planilha: https://docs.google.com/spreadsheets/d/1A26fTciavtuj57TTC-uCxfnMZaBwZzU30jDe4CE6zbc/edit
 * 2. Extensões → Apps Script
 * 3. Apagar o Code.gs em branco, colar TODO este arquivo, salvar (Ctrl+S)
 * 4. Clicar em "Implantar" → "Nova implantação"
 * 5. Tipo: "App da Web"
 *    - Executar como: Eu (agenciadouc@gmail.com)
 *    - Quem tem acesso: Qualquer pessoa
 * 6. Autorizar (aparece popup pedindo permissão pra planilha + fetch)
 * 7. Copiar a URL "/exec" gerada
 * 8. Colar essa URL no index.html da LP (constante APPS_SCRIPT_URL) e fazer git pull
 *
 * Ao editar este arquivo depois: precisa "Gerenciar implantações" → editar a existente
 * → "Nova versão" → salvar. Se criar deployment NOVO, muda a URL e quebra o form.
 */

const SHEET_NAME = 'LP REVENDEDOR';
const CRM_WEBHOOK = 'https://drosagencia.com.br/crm/api/webhooks/sheets/ustulimp-comercio-de-produtos-de-limpeza-ltda';

// Colunas em ordem — se mudar, mudar o headers[] tambem
const HEADERS = [
  'Timestamp', 'Perfil', 'Nome', 'WhatsApp', 'Cidade/UF',
  'CPF', 'CNPJ',
  'Já revende hoje', 'Como pretende vender',
  'Tipo estabelecimento', 'Já vende linha de limpeza',
  'Source', 'Source detail', 'Tags',
  'UTM source', 'UTM medium', 'UTM campaign', 'UTM content', 'UTM term',
  'fbclid', 'gclid', 'fbp', 'fbc',
  'Referrer', 'Landing page',
  'Device', 'Screen', 'Viewport', 'User agent',
  'Fill time (ms)',
  'CRM sync status', 'CRM sync response'
];

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    // 1. Escreve na planilha
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
    }
    // Garante headers na primeira linha
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#004F84').setFontColor('#fff');
      sheet.setFrozenRows(1);
    }

    // 2. Chama webhook CRM (antes de escrever, pra saber o status)
    let crmStatus = 'pending', crmResponse = '';
    try {
      const crmPayload = {
        name: body.nome,
        phone: body.whatsapp,
        city: body.cidade,
        cpf_cnpj: body.cpf_cnpj || body.cpf || body.cnpj || '',
        cpf: body.cpf || '',
        cnpj: body.cnpj || '',
        source: body.source || 'lp_revendedor',
        source_detail: body.source_detail || body.perfil || '',
        tags: body.tags || (body.perfil === 'Lojista' ? 'LP Lojista' : 'LP Revendedor'),
        utm_source: body.utm_source || '',
        utm_medium: body.utm_medium || '',
        utm_campaign: body.utm_campaign || '',
        utm_content: body.utm_content || '',
        utm_term: body.utm_term || '',
        fbclid: body.fbclid || '',
        gclid: body.gclid || '',
        referrer: body.referrer || '',
        landing_page: body.landing_page || '',
        // Campos extras vao pra notas do lead se webhook aceitar
        perfil: body.perfil,
        ja_revende: body.ja_revende,
        como_vende: body.como_vende,
        tipo_estabelecimento: body.tipo_estabelecimento,
        ja_vende_linha: body.ja_vende_linha
      };
      const resp = UrlFetchApp.fetch(CRM_WEBHOOK, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(crmPayload),
        muteHttpExceptions: true
      });
      const code = resp.getResponseCode();
      crmStatus = code >= 200 && code < 300 ? 'ok' : 'erro_' + code;
      crmResponse = resp.getContentText().substring(0, 500);
    } catch (crmErr) {
      crmStatus = 'exception';
      crmResponse = String(crmErr).substring(0, 500);
    }

    // 3. Escreve linha final
    const row = [
      body.timestamp || new Date().toISOString(),
      body.perfil || '',
      body.nome || '',
      body.whatsapp || '',
      body.cidade || '',
      body.cpf || '',
      body.cnpj || '',
      body.ja_revende || '',
      body.como_vende || '',
      body.tipo_estabelecimento || '',
      body.ja_vende_linha || '',
      body.source || '',
      body.source_detail || '',
      body.tags || '',
      body.utm_source || '',
      body.utm_medium || '',
      body.utm_campaign || '',
      body.utm_content || '',
      body.utm_term || '',
      body.fbclid || '',
      body.gclid || '',
      body.fbp || '',
      body.fbc || '',
      body.referrer || '',
      body.landing_page || '',
      body.device || '',
      body.screen || '',
      body.viewport || '',
      body.user_agent || '',
      body.fill_time_ms || '',
      crmStatus,
      crmResponse
    ];
    sheet.appendRow(row);

    return ContentService.createTextOutput(JSON.stringify({ ok: true, crm: crmStatus }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Teste rapido no editor: menu Executar → doPost_test
function doPost_test() {
  const fake = { postData: { contents: JSON.stringify({
    timestamp: new Date().toISOString(),
    perfil: 'Revendedor', nome: 'TESTE João Silva', whatsapp: '5511999999999',
    cidade: 'São Paulo / SP', cpf: '12345678909', cpf_cnpj: '12345678909',
    ja_revende: 'Não, seria minha primeira vez', como_vende: 'Pra vizinhos e conhecidos',
    source: 'lp_revendedor', source_detail: 'Formulario Revendedor', tags: 'LP Revendedor',
    utm_source: 'facebook', utm_medium: 'cpc', utm_campaign: 'teste',
    device: 'desktop', screen: '1920x1080', viewport: '1440x900',
    user_agent: 'Test', fill_time_ms: 30000
  }) } };
  const res = doPost(fake);
  Logger.log(res.getContent());
}
