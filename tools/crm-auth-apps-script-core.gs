// Apps Script login for the existing GitHub Pages site. No sheet writes here.
// The deployment bundle prepends scrypt-js 3.0.1 (MIT); credentials live in Script Properties.
function carCrmAuthJson_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
function carCrmAuthDigest_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)
    .map(function(b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}
function carCrmAuthEqual_(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  var difference = 0;
  for (var i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}
function carCrmAuthPassword_(password, hash) {
  if (typeof password !== 'string' || !password.length || password.length > 256 || !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash || '')) return false;
  var parts = hash.split(':');
  var bytes = function(text) { return Utilities.newBlob(text).getBytes().map(function(b) { return b & 255; }); };
  var actual = scrypt.syncScrypt(bytes(password), bytes(parts[0]), 16384, 8, 1, 64);
  return carCrmAuthEqual_(Array.from(actual).map(function(b) { return ('0' + b.toString(16)).slice(-2); }).join(''), parts[1]);
}
function carCrmAuthSettings_() {
  var properties = PropertiesService.getScriptProperties();
  var raw = properties.getProperty('CAR_CRM_AUTH_CONFIG');
  if (!raw) throw new Error('ยังไม่ได้ตั้งค่าล็อกอิน CAR CRM');
  var settings = JSON.parse(raw);
  if (!settings.username || !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(settings.passwordHash || '') || !/^[a-f0-9]{64}$/.test(settings.secret || '')) throw new Error('การตั้งค่าล็อกอิน CAR CRM ไม่สมบูรณ์');
  return settings;
}
function carCrmAuthSession_(token, settings) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  var properties = PropertiesService.getScriptProperties();
  var key = 'CAR_CRM_SESSION_' + carCrmAuthDigest_(token);
  var raw = properties.getProperty(key);
  if (!raw) return null;
  var value = JSON.parse(raw);
  if (value.until <= Date.now() || value.revision !== settings.revision) { properties.deleteProperty(key); return null; }
  return {key:key, value:value};
}
function carCrmAuthHandle_(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {ok:false,code:400,error:'รูปแบบคำขอไม่ถูกต้อง'};
  var action = input.action;
  if (['login','session','commission','logout'].indexOf(action) === -1) return {ok:false,code:404,error:'ไม่พบคำสั่งล็อกอิน'};
  var settings = carCrmAuthSettings_();
  var properties = PropertiesService.getScriptProperties();
  var current = carCrmAuthSession_(input.sessionToken, settings);
  if (action === 'session') return {ok:true,authenticated:!!current,commission:!!current && current.value.commissionUntil > Date.now(),expiresAt:current ? current.value.until : 0};
  if (action === 'logout') {
    if (current) properties.deleteProperty(current.key);
    return {ok:true,authenticated:false,commission:false,expiresAt:0};
  }
  if (action === 'commission' && !current) return {ok:false,code:401,error:'กรุณาล็อกอิน CAR CRM ก่อน'};
  // This is a best-effort per-browser retry guard, not an IP firewall or global abuse monitor.
  var client = /^[a-f0-9]{32,64}$/.test(input.clientId || '') ? input.clientId : 'unknown';
  var attemptKey = 'CAR_CRM_AUTH_FAIL_' + carCrmAuthDigest_(action + ':' + client);
  var cache = CacheService.getScriptCache();
  var attempts = JSON.parse(cache.get(attemptKey) || '{"count":0,"until":0}');
  if (attempts.until <= Date.now()) attempts = {count:0,until:Date.now()+600000};
  if (attempts.count >= 10) return {ok:false,code:429,error:'ลองรหัสผ่านผิดหลายครั้ง กรุณารอสักครู่แล้วลองใหม่',retryAfter:Math.ceil((attempts.until-Date.now())/1000)};
  var allowed = action === 'login'
    ? typeof input.user === 'string' && input.user.trim() === settings.username && carCrmAuthPassword_(input.password, settings.passwordHash)
    : carCrmAuthPassword_(input.password, settings.commissionHash);
  if (!allowed) {
    attempts.count++;
    cache.put(attemptKey, JSON.stringify(attempts), Math.max(1,Math.ceil((attempts.until-Date.now())/1000)));
    return {ok:false,code:401,error:'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'};
  }
  cache.remove(attemptKey);
  if (action === 'commission') {
    current.value.commissionUntil = Math.min(current.value.until,Date.now()+1800000);
    properties.setProperty(current.key,JSON.stringify(current.value));
    return {ok:true,authenticated:true,commission:true,expiresAt:current.value.until};
  }
  var all = properties.getProperties(), count = 0;
  Object.keys(all).filter(function(key) { return key.indexOf('CAR_CRM_SESSION_') === 0; }).forEach(function(key) {
    var value;
    try { value = JSON.parse(all[key]); } catch (_) {}
    if (!value || value.until <= Date.now() || value.revision !== settings.revision) properties.deleteProperty(key);
    else count++;
  });
  if (count >= 800) return {ok:false,code:503,error:'มีผู้ใช้งานพร้อมกันมาก กรุณาลองใหม่ภายหลัง'};
  // HMAC provides unguessability; UUID and time provide a distinct input for each session.
  var token = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(Utilities.getUuid()+':'+Date.now()+':'+client, settings.secret, Utilities.Charset.UTF_8)).replace(/=+$/, '');
  var expires = Date.now()+43200000;
  properties.setProperty('CAR_CRM_SESSION_'+carCrmAuthDigest_(token),JSON.stringify({until:expires,commissionUntil:0,revision:settings.revision}));
  return {ok:true,authenticated:true,commission:false,sessionToken:token,expiresAt:expires};
}
function carCrmAuthPost_(event) {
  try {
    var raw = String(event && event.postData && event.postData.contents || '');
    if (!raw || raw.length > 4096) return carCrmAuthJson_({ok:false,code:400,error:'คำขอล็อกอินไม่ถูกต้อง'});
    return carCrmAuthJson_(carCrmAuthHandle_(JSON.parse(raw)));
  } catch (_) {
    return carCrmAuthJson_({ok:false,code:503,error:'ระบบล็อกอินไม่พร้อมชั่วคราว กรุณาลองใหม่'});
  }
}
function carCrmAuthStatus_() {
  var configured = false;
  try { carCrmAuthSettings_(); configured = true; } catch (_) {}
  return carCrmAuthJson_({authVersion:1,configured:configured});
}
