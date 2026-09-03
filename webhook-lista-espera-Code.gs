/**
 * Webhook da Lista de Espera — Engenheiro Dominante da IA → Google Sheets
 * Recebe cada cadastro do lista-espera.html e grava uma linha na planilha
 * "Lista de Espera — Engenheiro Dominante da IA" (a mesma planilha em que
 * este script já está instalado — já é a que recebe os leads reais hoje).
 *
 * Campos enviados pela página: nome, email, whatsapp, faixa_preco, data, origem
 */

function doPost(e) {
  try {
    var lock = LockService.getScriptLock();
    lock.waitLock(30000); // evita dois cadastros gravarem na mesma linha

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

    // Cria o cabeçalho na primeira execução
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Data', 'Nome', 'E-mail', 'WhatsApp', 'Faixa de preço', 'Origem']);
      sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
      sheet.setFrozenRows(1);
    } else {
      // Planilha já tinha cabeçalho antigo (sem a coluna "Faixa de preço",
      // de quando a página ainda não tinha essa pergunta). Corrige uma vez,
      // inserindo a coluna nova antes de "Origem", sem apagar nada.
      var cabecalho = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      if (cabecalho.indexOf('Faixa de preço') === -1) {
        var colOrigem = cabecalho.indexOf('Origem') + 1; // 1-based; 0 se não achar
        var posInsercao = colOrigem > 0 ? colOrigem : cabecalho.length + 1;
        sheet.insertColumnBefore(posInsercao);
        sheet.getRange(1, posInsercao).setValue('Faixa de preço').setFontWeight('bold');
      }
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
      d.faixa_preco || '',
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
