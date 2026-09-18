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
  'Qualificado (R$1500)',
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

    // 2. Chama webhook CRM (SEMPRE envia — nao qualificados vao com tag "Menos de R$1500"
    // pra time diferenciar no funil. Campanhas Meta continuam otimizando pra qualificados
    // via source_detail; a segregacao acontece no CRM via tag.
    const qualificado = body.qualificado === true || body.qualificado === 'true' || body.qualificado === 1 || body.qualificado === '1';
    let crmStatus = 'pending', crmResponse = '';
    // Monta tags: tag base do perfil + (se nao qualif) "Menos de R$1500"
    const tagBase = body.tags || (body.perfil === 'Lojista' ? 'LP Lojista' : 'LP Revendedor');
    const tagsFinal = qualificado ? tagBase : (tagBase + ', Menos de R$1500');
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
        tags: tagsFinal,
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
        ja_vende_linha: body.ja_vende_linha,
        qualificado: qualificado,
        investimento_1500: qualificado ? 'sim' : 'nao'
      };
      const resp = UrlFetchApp.fetch(CRM_WEBHOOK, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(crmPayload),
        muteHttpExceptions: true
      });
      const code = resp.getResponseCode();
      crmStatus = code >= 200 && code < 300 ? (qualificado ? 'ok' : 'ok_menos1500') : 'erro_' + code;
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
      qualificado ? 'SIM' : 'NAO',
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

// Teste rapido no editor: menu Executar → doPost_test_qualificado / doPost_test_nao_qualificado
function doPost_test_qualificado() {
  const fake = { postData: { contents: JSON.stringify({
    timestamp: new Date().toISOString(),
    perfil: 'Revendedor', nome: 'TESTE João Silva QUALIFICADO', whatsapp: '5511999999999',
    cidade: 'São Paulo / SP', cpf: '12345678909', cpf_cnpj: '12345678909',
    ja_revende: 'Não, seria minha primeira vez', como_vende: 'Pra vizinhos e conhecidos',
    qualificado: true, qualifica_resposta: 'sim', investimento_1500: 'sim',
    source: 'lp_revendedor', source_detail: 'Formulario Revendedor', tags: 'LP Revendedor',
    utm_source: 'facebook', utm_medium: 'cpc', utm_campaign: 'teste',
    device: 'desktop', screen: '1920x1080', viewport: '1440x900',
    user_agent: 'Test', fill_time_ms: 30000
  }) } };
  const res = doPost(fake);
  Logger.log(res.getContent());
}

function doPost_test_nao_qualificado() {
  const fake = { postData: { contents: JSON.stringify({
    timestamp: new Date().toISOString(),
    perfil: 'Revendedor', nome: 'TESTE Maria Souza SEM 1500', whatsapp: '5511988888888',
    cidade: 'Rio de Janeiro / RJ', cpf: '98765432100', cpf_cnpj: '98765432100',
    ja_revende: 'Não', como_vende: 'Pra vizinhos',
    qualificado: false, qualifica_resposta: 'nao', investimento_1500: 'nao',
    source: 'lp_revendedor', source_detail: 'Formulario Revendedor', tags: 'LP Revendedor · Nao qualificado',
    utm_source: 'facebook', utm_medium: 'cpc', utm_campaign: 'teste',
    device: 'mobile', screen: '390x844', viewport: '390x664',
    user_agent: 'Test', fill_time_ms: 25000
  }) } };
  const res = doPost(fake);
  Logger.log(res.getContent());
}

/**
 * BACKFILL — envia retroativamente pro CRM todos os leads NAO QUALIFICADOS
 * que ficaram so na planilha (CRM sync status = "NAO QUALIFICADO..."),
 * com tag "Menos de R$1500". Roda uma vez no editor:
 *   Executar > backfillNaoQualificados
 * Depois de rodar, atualiza a coluna "CRM sync status" pra "ok_menos1500_backfill"
 * pra nao mandar duplicado.
 */
function backfillNaoQualificados() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) { Logger.log('Aba nao encontrada: ' + SHEET_NAME); return; }
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) { Logger.log('Sem dados'); return; }

  // Mapa de headers → indice de coluna (base 1)
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const col = {};
  headers.forEach((h, i) => col[String(h).trim()] = i + 1);

  const colSyncStatus = col['CRM sync status'];
  const colSyncResp = col['CRM sync response'];
  const colQualif = col['Qualificado (R$1500)'];
  if (!colSyncStatus || !colQualif) {
    Logger.log('Colunas nao encontradas — verifica headers');
    return;
  }

  const data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  let enviados = 0, jaEnviados = 0, erros = 0, ignorados = 0;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rowIndex = i + 2; // linha real na planilha (com header)
    const qualifText = String(row[colQualif - 1] || '').toUpperCase();
    const syncStatus = String(row[colSyncStatus - 1] || '');

    // So processa: nao qualificado + ainda nao enviado ao CRM
    if (qualifText !== 'NAO' && qualifText !== 'NÃO') { ignorados++; continue; }
    if (syncStatus.indexOf('ok') === 0 || syncStatus.indexOf('backfill') >= 0) { jaEnviados++; continue; }

    // Monta payload a partir da linha
    const perfil = row[col['Perfil'] - 1] || '';
    const tagBase = perfil === 'Lojista' ? 'LP Lojista' : 'LP Revendedor';
    const payload = {
      name: row[col['Nome'] - 1] || '',
      phone: row[col['WhatsApp'] - 1] || '',
      city: row[col['Cidade/UF'] - 1] || '',
      cpf_cnpj: row[col['CPF'] - 1] || row[col['CNPJ'] - 1] || '',
      cpf: row[col['CPF'] - 1] || '',
      cnpj: row[col['CNPJ'] - 1] || '',
      source: row[col['Source'] - 1] || 'lp_revendedor',
      source_detail: row[col['Source detail'] - 1] || perfil,
      tags: tagBase + ', Menos de R$1500, Backfill',
      utm_source: row[col['UTM source'] - 1] || '',
      utm_medium: row[col['UTM medium'] - 1] || '',
      utm_campaign: row[col['UTM campaign'] - 1] || '',
      utm_content: row[col['UTM content'] - 1] || '',
      utm_term: row[col['UTM term'] - 1] || '',
      fbclid: row[col['fbclid'] - 1] || '',
      gclid: row[col['gclid'] - 1] || '',
      referrer: row[col['Referrer'] - 1] || '',
      landing_page: row[col['Landing page'] - 1] || '',
      perfil: perfil,
      ja_revende: row[col['Já revende hoje'] - 1] || '',
      como_vende: row[col['Como pretende vender'] - 1] || '',
      tipo_estabelecimento: row[col['Tipo estabelecimento'] - 1] || '',
      ja_vende_linha: row[col['Já vende linha de limpeza'] - 1] || '',
      qualificado: false,
      investimento_1500: 'nao'
    };

    try {
      const resp = UrlFetchApp.fetch(CRM_WEBHOOK, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
      const code = resp.getResponseCode();
      if (code >= 200 && code < 300) {
        sheet.getRange(rowIndex, colSyncStatus).setValue('ok_menos1500_backfill');
        sheet.getRange(rowIndex, colSyncResp).setValue(resp.getContentText().substring(0, 500));
        enviados++;
      } else {
        sheet.getRange(rowIndex, colSyncStatus).setValue('erro_backfill_' + code);
        sheet.getRange(rowIndex, colSyncResp).setValue(resp.getContentText().substring(0, 500));
        erros++;
      }
    } catch (err) {
      sheet.getRange(rowIndex, colSyncStatus).setValue('excecao_backfill');
      sheet.getRange(rowIndex, colSyncResp).setValue(String(err).substring(0, 500));
      erros++;
    }
    // Pausa breve pra nao bater rate limit do CRM
    Utilities.sleep(300);
  }

  Logger.log('Backfill concluido — enviados=' + enviados + ' jaEnviados=' + jaEnviados + ' erros=' + erros + ' ignorados=' + ignorados);
  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Backfill: ' + enviados + ' enviados, ' + erros + ' erros, ' + jaEnviados + ' ja tinham sido',
    'Ustulimp CRM',
    10
  );
}
