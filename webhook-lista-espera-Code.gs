/**
 * Webhook da Lista de Espera — Engenheiro Dominante da IA → Google Sheets
 * Recebe cada cadastro do lista-espera.html e grava uma linha na planilha.
 * Preso à planilha em que este script for criado (Extensões ▸ Apps Script).
 *
 * Campos enviados pela página: nome, email, whatsapp, data, origem
 */

function doPost(e) {
  try {
    var lock = LockService.getScriptLock();
    lock.waitLock(30000); // evita dois cadastros gravarem na mesma linha

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

    // Cria o cabeçalho na primeira execução
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Data', 'Nome', 'E-mail', 'WhatsApp', 'Origem']);
      sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    // A página envia JSON (via no-cors vira text/plain) — tenta JSON, cai para parâmetros
    var d = {};
    if (e && e.postData && e.postData.contents) {
      try { d = JSON.parse(e.postData.contents); }
      catch (err) { d = (e && e.parameter) || {}; }
    } else {
      d = (e && e.parameter) || {};
    }

    // Data legível (fuso de Pernambuco)
    var quando = d.data
      ? Utilities.formatDate(new Date(d.data), 'America/Recife', 'dd/MM/yyyy HH:mm')
      : Utilities.formatDate(new Date(), 'America/Recife', 'dd/MM/yyyy HH:mm');

    sheet.appendRow([
      quando,
      d.nome || '',
      d.email || '',
      d.whatsapp || '',
      d.origem || 'lista-espera-engenheiro-dominante-ia'
    ]);

    lock.releaseLock();
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput('Webhook da Lista de Espera (Engenheiro Dominante da IA) ativo.')
    .setMimeType(ContentService.MimeType.TEXT);
}
