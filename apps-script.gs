/**
 * USTULIMP · LP Revendedor — captura de leads (schema 2026-10 com filtro de situacao)
 *
 * SCHEMA NOVO (depois da reuniao 07/10/2026):
 *   - Removido CPF/CNPJ, "Como pretende vender", "Tipo estabelecimento", "Ja vende linha"
 *   - Adicionado "Situacao" (loja / distribuidora / porta a porta / quer iniciar)
 *   - Qualificacao: ja atua (!= iniciar) E tem R$ 1.500
 *   - Nao qualificado NAO vai pro CRM (so planilha) — evita contaminar otimizacao Meta
 *
 * ABA DE DESTINO: 'LP REVENDEDOR 2026' (nova — nao mexe na aba antiga pra preservar histórico/backfill)
 *
 * Instalacao (uma vez so):
 * 1. Abrir https://docs.google.com/spreadsheets/d/1A26fTciavtuj57TTC-uCxfnMZaBwZzU30jDe4CE6zbc/edit
 * 2. Extensoes > Apps Script
 * 3. Apagar tudo, colar este arquivo, salvar
 * 4. Implantar > Gerenciar implantacoes > Editar a atual > Nova versao > Implantar
 *    (NAO criar deployment novo — a URL ja esta no index.html)
 */

const SHEET_NAME = 'LP REVENDEDOR 2026';
const SHEET_NAME_LEGACY = 'LP REVENDEDOR'; // usado so pelo backfill de nao-qualificados antigos
const CRM_WEBHOOK = 'https://drosagencia.com.br/crm/api/webhooks/sheets/ustulimp-comercio-de-produtos-de-limpeza-ltda';

// Ordem das colunas na aba nova — se mudar, mudar HEADERS tambem (writer e name-based nao, usa posicao)
const HEADERS = [
  'Timestamp', 'Perfil', 'Nome', 'WhatsApp', 'Cidade/UF',
  'Situacao', 'Qualificado',
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

    // 1. Garante aba + headers
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(HEADERS);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#004F84').setFontColor('#fff');
      sheet.setFrozenRows(1);
    } else if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#004F84').setFontColor('#fff');
      sheet.setFrozenRows(1);
    }

    // 2. Decide qualificacao e tag base
    const qualificado = body.qualificado === true || body.qualificado === 'true' || body.qualificado === 1 || body.qualificado === '1';
    const situacao = String(body.situacao || '').toLowerCase();
    const perfilLabel = String(body.perfil || body.situacao_label || '');
    // Frontend ja manda tags montadas (ex: "LP Lojista Qualificado"). Fallback por garantia:
    const SITUACAO_TAG = { loja: 'LP Lojista', distribuidora: 'LP Distribuidor', porta_a_porta: 'LP Revendedor PortaPorta', iniciar: 'LP Quer Iniciar' };
    const tagBase = SITUACAO_TAG[situacao] || 'LP Revendedor';
    const tagsFinal = body.tags || (qualificado ? (tagBase + ' Qualificado') : (tagBase + ' NAO Qualificado'));

    // 3. Chama webhook CRM — SO se qualificado (nao polui otimizacao Meta)
    let crmStatus = qualificado ? 'pending' : 'nao_qualificado_nao_enviado';
    let crmResponse = qualificado ? '' : 'Lead desqualificado — fica so na planilha';

    if (qualificado) {
      try {
        const crmPayload = {
          name: body.nome,
          phone: body.whatsapp,
          city: body.cidade,
          source: body.source || 'lp_revendedor',
          source_detail: body.source_detail || perfilLabel,
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
          // Campos extras (viram notas no CRM se o webhook mapear)
          perfil: perfilLabel,
          situacao: situacao,
          qualificado: true,
          investimento_1500: 'sim'
        };
        const resp = UrlFetchApp.fetch(CRM_WEBHOOK, {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify(crmPayload),
          muteHttpExceptions: true
        });
        const code = resp.getResponseCode();
        crmStatus = (code >= 200 && code < 300) ? 'ok' : ('erro_' + code);
        crmResponse = resp.getContentText().substring(0, 500);
      } catch (crmErr) {
        crmStatus = 'exception';
        crmResponse = String(crmErr).substring(0, 500);
      }
    }

    // 4. Escreve linha
    const row = [
      body.timestamp || new Date().toISOString(),
      perfilLabel,
      body.nome || '',
      body.whatsapp || '',
      body.cidade || '',
      situacao,
      qualificado ? 'SIM' : 'NAO',
      body.source || '',
      body.source_detail || '',
      tagsFinal,
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

// Testes rapidos — Executar > doPost_test_qualificado / doPost_test_nao_qualificado_iniciar / doPost_test_nao_qualificado_sem1500
function doPost_test_qualificado() {
  const fake = { postData: { contents: JSON.stringify({
    timestamp: new Date().toISOString(),
    perfil: 'Ja tem loja', situacao: 'loja',
    nome: 'TESTE Joao Loja QUALIFICADO', whatsapp: '5511999999999',
    cidade: 'Sao Paulo / SP',
    qualificado: true, qualifica_resposta: 'sim', investimento_1500: 'sim',
    source: 'lp_revendedor', source_detail: 'Qualificado - Ja tem loja',
    tags: 'LP Lojista Qualificado',
    utm_source: 'facebook', utm_medium: 'cpc', utm_campaign: 'teste',
    device: 'desktop', screen: '1920x1080', viewport: '1440x900',
    user_agent: 'Test', fill_time_ms: 30000
  }) } };
  Logger.log(doPost(fake).getContent());
}

function doPost_test_nao_qualificado_iniciar() {
  const fake = { postData: { contents: JSON.stringify({
    timestamp: new Date().toISOString(),
    perfil: 'Quer iniciar (nao revende ainda)', situacao: 'iniciar',
    nome: 'TESTE Maria Iniciante SEM REVENDA', whatsapp: '5511988888888',
    cidade: 'Rio de Janeiro / RJ',
    qualificado: false, qualifica_resposta: 'sim', investimento_1500: 'sim',
    source: 'lp_revendedor', source_detail: 'Nao qualificado - Ainda nao revende (quer iniciar)',
    tags: 'LP Quer Iniciar NAO Qualificado',
    utm_source: 'facebook', utm_medium: 'cpc', utm_campaign: 'teste',
    device: 'mobile', screen: '390x844', viewport: '390x664',
    user_agent: 'Test', fill_time_ms: 25000
  }) } };
  Logger.log(doPost(fake).getContent());
}

function doPost_test_nao_qualificado_sem1500() {
  const fake = { postData: { contents: JSON.stringify({
    timestamp: new Date().toISOString(),
    perfil: 'Ja revende porta a porta', situacao: 'porta_a_porta',
    nome: 'TESTE Carlos SEM 1500', whatsapp: '5511977777777',
    cidade: 'Belo Horizonte / MG',
    qualificado: false, qualifica_resposta: 'nao', investimento_1500: 'nao',
    source: 'lp_revendedor', source_detail: 'Nao qualificado - Nao tem R$ 1.500 pro 1o pedido',
    tags: 'LP Revendedor PortaPorta NAO Qualificado',
    utm_source: 'facebook', utm_medium: 'cpc', utm_campaign: 'teste',
    device: 'mobile', screen: '390x844', viewport: '390x664',
    user_agent: 'Test', fill_time_ms: 25000
  }) } };
  Logger.log(doPost(fake).getContent());
}

/**
 * BACKFILL (legado) — reenvia pro CRM os NAO QUALIFICADOS antigos da aba 'LP REVENDEDOR'
 * (schema anterior com CPF/CNPJ). Rode uma unica vez se precisar recuperar historico.
 * Depois da reuniao 07/10 decidimos NAO enviar nao-qualificados pro CRM, entao este backfill
 * nao se aplica a leads novos — fica aqui so pra reprocessar o legado se o time pedir.
 */
function backfillNaoQualificados_legacy() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME_LEGACY);
  if (!sheet) { Logger.log('Aba legada nao encontrada: ' + SHEET_NAME_LEGACY); return; }
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) { Logger.log('Sem dados na aba legada'); return; }

  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const col = {}, colNorm = {};
  headers.forEach((h, i) => { const t = String(h).trim(); col[t] = i + 1; colNorm[norm(t)] = i + 1; });
  const findCol = (cands) => { for (const c of cands) { if (col[c]) return col[c]; const n = norm(c); if (colNorm[n]) return colNorm[n]; } return null; };

  const colSyncStatus = findCol(['CRM sync status', 'CRM sync', 'sync status']);
  const colSyncResp = findCol(['CRM sync response', 'CRM response', 'sync response']);
  if (!colSyncStatus) { Logger.log('Coluna "CRM sync status" nao encontrada. Headers: ' + JSON.stringify(headers)); return; }

  const data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  let enviados = 0, jaEnviados = 0, erros = 0, ignorados = 0;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rowIndex = i + 2;
    const syncStatus = String(row[colSyncStatus - 1] || '');
    const syncResp = colSyncResp ? String(row[colSyncResp - 1] || '') : '';
    const statusAll = (syncStatus + ' | ' + syncResp).toUpperCase();

    const isNaoQualif = statusAll.indexOf('NAO QUALIFICADO') >= 0 || statusAll.indexOf('NÃO QUALIFICADO') >= 0;
    if (!isNaoQualif) { ignorados++; continue; }
    if (statusAll.indexOf('BACKFILL') >= 0 || syncStatus.indexOf('ok_menos1500') === 0) { jaEnviados++; continue; }

    const perfil = row[(col['Perfil'] || 2) - 1] || '';
    const tagBase = String(perfil).toLowerCase().indexOf('cnpj') >= 0 ? 'LP Lojista' : 'LP Revendedor';
    const payload = {
      name: row[(col['Nome'] || 3) - 1] || '',
      phone: row[(col['WhatsApp'] || 4) - 1] || '',
      city: row[(col['Cidade/UF'] || 5) - 1] || '',
      source: row[(col['Source'] || 12) - 1] || 'lp_revendedor',
      source_detail: row[(col['Source detail'] || 13) - 1] || perfil,
      tags: tagBase + ', Menos de R$1500, Backfill',
      utm_source: row[(col['UTM source'] || 15) - 1] || '',
      utm_medium: row[(col['UTM medium'] || 16) - 1] || '',
      utm_campaign: row[(col['UTM campaign'] || 17) - 1] || '',
      perfil, qualificado: false, investimento_1500: 'nao'
    };

    try {
      const resp = UrlFetchApp.fetch(CRM_WEBHOOK, {
        method: 'post', contentType: 'application/json',
        payload: JSON.stringify(payload), muteHttpExceptions: true
      });
      const code = resp.getResponseCode();
      if (code >= 200 && code < 300) {
        sheet.getRange(rowIndex, colSyncStatus).setValue('ok_menos1500_backfill');
        if (colSyncResp) sheet.getRange(rowIndex, colSyncResp).setValue(resp.getContentText().substring(0, 500));
        enviados++;
      } else {
        sheet.getRange(rowIndex, colSyncStatus).setValue('erro_backfill_' + code);
        if (colSyncResp) sheet.getRange(rowIndex, colSyncResp).setValue(resp.getContentText().substring(0, 500));
        erros++;
      }
    } catch (err) {
      sheet.getRange(rowIndex, colSyncStatus).setValue('excecao_backfill');
      if (colSyncResp) sheet.getRange(rowIndex, colSyncResp).setValue(String(err).substring(0, 500));
      erros++;
    }
    Utilities.sleep(300);
  }

  Logger.log('Backfill legado concluido — enviados=' + enviados + ' jaEnviados=' + jaEnviados + ' erros=' + erros + ' ignorados=' + ignorados);
  SpreadsheetApp.getActiveSpreadsheet().toast('Backfill legado: ' + enviados + ' enviados, ' + erros + ' erros, ' + jaEnviados + ' ja tinham sido', 'Ustulimp CRM', 10);
}
