// Additive metadata-only CAR message-day ledger for Line+FB_Chat.
const CAR_DAILY_ACCOUNT = '1657810104';
const CAR_DAILY_SHEET = 'CAR_Line_Daily';
function carDailySheet_() {
  const book = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = book.getSheetByName(CAR_DAILY_SHEET);
  if (!sheet) {
    sheet = book.insertSheet(CAR_DAILY_SHEET);
    sheet.getRange(1,1,2,6).setNumberFormat('@').setValues([
      ['kind','account_id','customer_id','day','first_at','last_at'],
      ['coverage',CAR_DAILY_ACCOUNT,'','',new Date().toISOString(),new Date().toISOString()]
    ]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}
function initializeCarDaily() {
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try { carDailySheet_(); SpreadsheetApp.flush(); Logger.log('CAR daily ledger ready'); }
  finally { lock.releaseLock(); }
}
function recordCarLineDaily_(data, accountId) {
  if (String(accountId) !== CAR_DAILY_ACCOUNT) return;
  const events = (data.events || []).filter(event => event.type === 'message'
    && event.source?.type === 'user' && /^U[0-9a-f]{32}$/i.test(event.source.userId || '')
    && Number.isFinite(event.timestamp) && event.timestamp > 0);
  if (!events.length) return;
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const sheet = carDailySheet_();
    const rows = sheet.getDataRange().getDisplayValues();
    const index = new Map();
    rows.forEach((row,i) => { if (row[0] === 'message') index.set(row[2]+'|'+row[3],{row:i+1,values:row}); });
    for (const event of events) {
      const time = new Date(event.timestamp), iso = time.toISOString();
      const day = Utilities.formatDate(time,'Asia/Bangkok','yyyy-MM-dd');
      const key = event.source.userId+'|'+day;
      const old = index.get(key);
      const values = ['message',CAR_DAILY_ACCOUNT,event.source.userId,day,
        old && old.values[4] < iso ? old.values[4] : iso,
        old && old.values[5] > iso ? old.values[5] : iso];
      const row = old ? old.row : sheet.getLastRow()+1;
      sheet.getRange(row,1,1,6).setNumberFormat('@').setValues([values]);
      index.set(key,{row,values});
    }
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
}
