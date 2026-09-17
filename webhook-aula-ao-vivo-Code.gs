/**
 * Webhook da Inscrição — Aula ao vivo e gratuita (13/10) → Google Sheets
 * Recebe cada cadastro do aula-ao-vivo.html e grava uma linha na planilha
 * "Inscrições — Aula ao vivo 13-10" (a planilha em que este script for instalado).
 *
 * Campos enviados pela página: nome, whatsapp, email, atuacao, uso_ia,
 * como_conheceu, data, origem
 */

function doPost(e) {
  try {
    var lock = LockService.getScriptLock();
    lock.waitLock(30000); // evita dois cadastros gravarem na mesma linha

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

    // Cria o cabeçalho na primeira execução
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Data', 'Nome', 'WhatsApp', 'E-mail', 'Atuação', 'Uso de IA hoje', 'Como conheceu', 'Origem']);
      sheet.getRange(1, 1, 1, 8).setFontWeight('bold');
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
      d.whatsapp || '',
      d.email || '',
      d.atuacao || '',
      d.uso_ia || '',
      d.como_conheceu || '',
      d.origem || 'aula-ao-vivo-13-10'
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
    .createTextOutput('Webhook da Inscrição (Aula ao vivo 13/10) ativo.')
    .setMimeType(ContentService.MimeType.TEXT);
}
