#include "web.h"

#include <WebServer.h>
#include <WiFi.h>
#include <time.h>

#include "config.h"

// Security model
//  - Every data and state-changing endpoint needs the owner's PIN in the X-Sakshi-Pin
//    header. A custom header cannot be sent by a cross-site form, and a cross-site fetch
//    that adds one triggers a CORS preflight this server never answers.
//  - Requests must name the device in Host (blocks DNS rebinding); POSTs from a browser
//    must come from the device's own origin.
//  - Five wrong PINs lock the API for five minutes. The PIN is stored salted and hashed.
//  - Until a PIN exists only the setup form accepts writes, over the setup access point
//    whose random password is printed on serial (write it on the device label).
namespace {
WebServer server(80);
Settings* gSettings = nullptr;
LogStore* gStore = nullptr;
WebHooks gHooks;
uint8_t failedPins = 0;
bool locked = false;
uint32_t lockedAt = 0;
constexpr uint32_t kLockMs = 5UL * 60UL * 1000UL;
constexpr uint8_t kMaxFailures = 5;

void securityHeaders() {
  server.sendHeader("X-Frame-Options", "DENY");
  server.sendHeader("X-Content-Type-Options", "nosniff");
  server.sendHeader("Cache-Control", "no-store");
  server.sendHeader("Referrer-Policy", "no-referrer");
}

void sendText(int code, const String& message) {
  securityHeaders();
  server.send(code, "text/plain", message);
}

String bareHost() {
  String host = server.hostHeader();
  const int colon = host.indexOf(':');
  if (colon >= 0) host = host.substring(0, colon);
  host.toLowerCase();
  return host;
}

bool hostAllowed() {
  const String host = bareHost();
  if (host.length() == 0) return true;  // HTTP/1.0 clients; the PIN is still required
  String id = gSettings->deviceId;
  id.toLowerCase();
  return host == WiFi.localIP().toString() || host == WiFi.softAPIP().toString() || host == id || host == id + ".local";
}

bool originAllowed() {
  if (!server.hasHeader("Origin")) return true;  // non-browser client
  String origin = server.header("Origin");
  origin.toLowerCase();
  return origin == "http://" + bareHost();
}

bool guard(bool stateChanging) {
  if (!hostAllowed()) {
    sendText(421, "Unknown host");
    return false;
  }
  if (stateChanging && !originAllowed()) {
    sendText(403, "Cross-site request refused");
    return false;
  }
  return true;
}

bool authorised() {
  if (!gSettings->hasPin()) {
    sendText(403, "Finish Setup and choose a PIN first.");
    return false;
  }
  if (locked && millis() - lockedAt < kLockMs) {
    sendText(429, "Too many wrong PINs. Try again in 5 minutes.");
    return false;
  }
  locked = false;
  if (pinMatches(*gSettings, server.header("X-Sakshi-Pin"))) {
    failedPins = 0;
    return true;
  }
  if (++failedPins >= kMaxFailures) {
    locked = true;
    lockedAt = millis();
    failedPins = 0;
  }
  sendText(401, "Wrong or missing PIN");
  return false;
}

String jsonEscape(const String& in) {
  String out;
  for (size_t i = 0; i < in.length(); ++i) {
    const char c = in[i];
    if (c == '"' || c == '\\') {
      out += '\\';
      out += c;
    } else if (static_cast<uint8_t>(c) >= 0x20) {
      out += c;
    }
  }
  return out;
}

bool validDay(const String& day) {
  if (day.length() != 8) return false;
  for (size_t i = 0; i < 8; ++i) {
    if (!isDigit(day[i])) return false;
  }
  return true;
}

String utcDay(time_t t) {
  struct tm tm;
  gmtime_r(&t, &tm);
  char buf[9];
  strftime(buf, sizeof(buf), "%Y%m%d", &tm);
  return String(buf);
}

// Shared page chrome: PIN kept in sessionStorage, every API call sends it as a header,
// and all values are inserted with textContent (never innerHTML).
const char kHead[] PROGMEM = R"HTML(<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'none'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'">
<title>Meter Sakshi</title><style>body{font:15px system-ui,sans-serif;max-width:640px;margin:24px auto;padding:0 16px;color:#1b1f24}
h1{font-size:22px}dl{display:grid;grid-template-columns:170px 1fr;gap:4px 12px}dt{color:#5b6470}label{display:block;margin:10px 0}
input{font:inherit;padding:6px;width:100%;max-width:320px}button{margin:4px 6px 4px 0;padding:8px 12px;border:1px solid #2e6f8e;border-radius:6px;background:#fff;color:#2e6f8e;font:inherit;cursor:pointer}
.warn{color:#b42318}small{color:#5b6470}#msg{font-weight:600}</style></head><body>
<h1>Meter Sakshi</h1><p><small>Non-contact check meter. Reads the meter's pulse LED only; never opens, wires into or alters the meter.</small></p>
<label>PIN <input id="pin" type="password" inputmode="numeric" autocomplete="current-password"></label><p id="msg"></p>
<script>
const pinBox=document.getElementById('pin');pinBox.value=sessionStorage.getItem('pin')||'';
pinBox.addEventListener('change',()=>{sessionStorage.setItem('pin',pinBox.value);if(window.refresh)refresh();});
function say(t){document.getElementById('msg').textContent=t;}
async function api(path,opts){opts=opts||{};opts.headers=Object.assign({'X-Sakshi-Pin':pinBox.value},opts.headers||{});const r=await fetch(path,opts);if(!r.ok)throw new Error(await r.text());return r;}
async function save(path,name){try{const b=await (await api(path)).blob();const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);}catch(e){say(e.message);}}
</script>)HTML";

const char kStatusBody[] PROGMEM = R"HTML(<dl id="s"></dl>
<h2>Export</h2><p><button onclick="save('/api/log','meter-sakshi-log.csv')">Download log (last 31 days)</button><button onclick="save('/api/digests','meter-sakshi-digests.csv')">Daily digests</button></p>
<p><small>Share each day's digest with someone you trust (e-mail, WhatsApp): it timestamps your log independently.</small></p>
<h2>Home tests</h2>
<p><button onclick="t('creep',20)">No-load test (20 min)</button><button onclick="t('reference',30)">Reference-load test (30 min)</button><button onclick="t('none',0)">Stop test</button></p>
<p><small>No-load: switch OFF your main switch (after the meter) first. Reference: switch everything off except one known load measured with a plug-in meter.</small></p>
<p><a href="/setup">Setup</a></p>
<script>
function row(k,v,warn){const dt=document.createElement('dt');dt.textContent=k;const dd=document.createElement('dd');dd.textContent=v;if(warn)dd.className='warn';return [dt,dd];}
async function refresh(){try{const j=await (await api('/api/status')).json();say('');const s=document.getElementById('s');s.replaceChildren(...[
row('Device',j.deviceId),row('Meter constant',j.impPerKwh?j.impPerKwh+' imp/kWh':'not set: open Setup',!j.impPerKwh),
row('Clock (UTC)',j.time+(j.clockSynced?'':' (not synced)'),!j.clockSynced),row('Household supply',j.supplyPresent?'on':'OFF (on battery)',!j.supplyPresent),
row('Power (last minute)',j.watts.toFixed(0)+' W'),row('Today (UTC)',j.kwhToday.toFixed(2)+' kWh'),
row('Test mode',j.testMode+(j.testMinutesLeft?' ('+j.testMinutesLeft+' min left)':'')),row('Last digest',j.lastDigest||'none yet'),row('Firmware',j.firmware)].flat());}catch(e){say(e.message);}}
async function t(m,n){try{const r=await api('/api/test',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'mode='+m+'&minutes='+n});say(await r.text());refresh();}catch(e){say(e.message);}}
window.refresh=refresh;refresh();setInterval(refresh,5000);</script></body></html>)HTML";

const char kSetupBody[] PROGMEM = R"HTML(<h2>Setup</h2>
<p><small>On first setup choose a PIN of 6-12 digits. Afterwards enter the current PIN above to change anything. Empty fields keep their current value.</small></p>
<form id="f">
<label>Meter constant (imp/kWh, printed on the meter) <input name="imp" type="number" min="100" max="100000"></label>
<label>Debounce (microseconds) <input name="filter" type="number" min="1000" max="200000" placeholder="15000"></label>
<label><input name="activeLow" type="checkbox" checked style="width:auto"> Sensor output goes LOW on light (LM393 modules)</label>
<label>Wi-Fi name <input name="ssid" maxlength="32"></label>
<label>Wi-Fi password <input name="pass" type="password" maxlength="63"></label>
<label>Meter serial (optional) <input name="serial" maxlength="40"></label>
<label>New PIN (6-12 digits) <input name="newpin" type="password" inputmode="numeric" maxlength="12" autocomplete="new-password"></label>
<button>Save and restart</button></form>
<p><small>Changing the meter constant starts a new hash chain: export your log first. Forgot the PIN? Hold the BOOT button while powering on for 5 seconds to clear it (logs are kept).</small></p>
<script>document.getElementById('f').addEventListener('submit',async e=>{e.preventDefault();
const body=new URLSearchParams(new FormData(e.target));try{const r=await api('/setup',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});say(await r.text());}catch(err){say(err.message);}});</script></body></html>)HTML";

void sendPage(const char* body) {
  securityHeaders();
  server.setContentLength(CONTENT_LENGTH_UNKNOWN);
  server.send(200, "text/html", "");
  server.sendContent_P(kHead);
  server.sendContent_P(body);
  server.sendContent("");
}

void handleStatus() {
  if (!guard(false) || !authorised()) return;
  const LiveStatus live = gHooks.status();
  char timeBuf[24] = "unknown";
  const time_t now = time(nullptr);
  if (live.clockSynced) {
    struct tm tm;
    gmtime_r(&now, &tm);
    strftime(timeBuf, sizeof(timeBuf), "%Y-%m-%d %H:%M:%S", &tm);
  }
  const float kwhToday = gSettings->impPerKwh ? static_cast<float>(gStore->pulsesToday()) / gSettings->impPerKwh : 0.0f;
  String json = "{";
  json += "\"deviceId\":\"" + jsonEscape(gSettings->deviceId) + "\",";
  json += "\"impPerKwh\":" + String(gSettings->impPerKwh) + ",";
  json += "\"time\":\"" + String(timeBuf) + "\",";
  json += "\"clockSynced\":" + String(live.clockSynced ? "true" : "false") + ",";
  json += "\"supplyPresent\":" + String(live.supplyPresent ? "true" : "false") + ",";
  json += "\"lastMinutePulses\":" + String(live.lastMinutePulses) + ",";
  json += "\"watts\":" + String(live.watts, 1) + ",";
  json += "\"kwhToday\":" + String(kwhToday, 3) + ",";
  json += "\"rejectedEdges\":" + String(live.rejectedEdges) + ",";
  json += "\"testMode\":\"" + String(live.testMode) + "\",";
  json += "\"testMinutesLeft\":" + String(live.testMinutesLeft) + ",";
  json += "\"pendingMinutes\":" + String(live.pendingMinutes) + ",";
  json += "\"lastDigest\":\"" + jsonEscape(gStore->lastDigestLine()) + "\",";
  json += "\"chainHash\":\"" + String(gStore->chainHash().c_str()) + "\",";
  json += "\"firmware\":\"" SAKSHI_FIRMWARE_VERSION "\"}";
  securityHeaders();
  server.send(200, "application/json", json);
}

void handleLog() {
  if (!guard(false) || !authorised()) return;
  const time_t now = time(nullptr);
  const String to = server.hasArg("to") ? server.arg("to") : utcDay(now);
  const String from = server.hasArg("from") ? server.arg("from") : utcDay(now - 30L * 86400L);
  if (!validDay(from) || !validDay(to) || from > to) {
    sendText(400, "from/to must be YYYYMMDD with from <= to");
    return;
  }
  securityHeaders();
  server.sendHeader("Content-Disposition", "attachment; filename=\"meter-sakshi-" + gSettings->deviceId + "-" + from + "-" + to + ".csv\"");
  server.setContentLength(CONTENT_LENGTH_UNKNOWN);
  server.send(200, "text/csv", "");
  gStore->exportCsv(from, to, SAKSHI_FIRMWARE_VERSION, gSettings->meterSerial, [](const String& chunk) { server.sendContent(chunk); });
  server.sendContent("");
}

void handleDigests() {
  if (!guard(false) || !authorised()) return;
  securityHeaders();
  server.setContentLength(CONTENT_LENGTH_UNKNOWN);
  server.send(200, "text/csv", "");
  gStore->exportDigests([](const String& chunk) { server.sendContent(chunk); });
  server.sendContent("");
}

void handleTest() {
  if (!guard(true) || !authorised()) return;
  const String mode = server.arg("mode");
  const long minutes = server.arg("minutes").toInt();
  if (mode != "creep" && mode != "reference" && mode != "none") {
    sendText(400, "mode must be creep, reference or none");
    return;
  }
  if (mode != "none" && (minutes < 1 || minutes > static_cast<long>(defaults::kMaxTestMinutes))) {
    sendText(400, "minutes must be 1-120");
    return;
  }
  gHooks.startTest(mode, static_cast<uint32_t>(minutes));
  sendText(200, mode == "none" ? "Test stopped." : "Test starts at the next minute and runs for " + String(minutes) + " minutes. Note the start time for your case file.");
}

String applySetup(Settings& next, bool firstTime) {
  const String imp = server.arg("imp");
  if (firstTime || imp.length() > 0) {
    const String error = validateImp(imp.toInt());
    if (!error.isEmpty()) return error;
    next.impPerKwh = static_cast<uint32_t>(imp.toInt());
  }
  const String filter = server.arg("filter");
  if (filter.length() > 0) {
    const String error = validateFilter(filter.toInt());
    if (!error.isEmpty()) return error;
    next.filterUs = static_cast<uint32_t>(filter.toInt());
  }
  next.pulseActiveLow = server.hasArg("activeLow");
  for (const char* field : {"ssid", "pass", "serial"}) {
    const size_t maxLength = String(field) == "ssid" ? 32 : (String(field) == "pass" ? 63 : 40);
    const String error = validateText(server.arg(field), maxLength, field);
    if (!error.isEmpty()) return error;
  }
  if (server.arg("ssid").length() > 0) next.wifiSsid = server.arg("ssid");
  if (server.arg("pass").length() > 0) next.wifiPass = server.arg("pass");
  if (server.arg("serial").length() > 0) next.meterSerial = server.arg("serial");
  const String newPin = server.arg("newpin");
  if (firstTime || newPin.length() > 0) {
    const String error = validatePin(newPin);
    if (!error.isEmpty()) return firstTime ? "Choose a PIN of 6-12 digits to finish setup." : error;
    setPin(next, newPin);
  }
  return "";
}

void handleSetupSave() {
  if (!guard(true)) return;
  const bool firstTime = !gSettings->hasPin();
  if (!firstTime && !authorised()) return;
  Settings next = *gSettings;
  const String error = applySetup(next, firstTime);
  if (!error.isEmpty()) {
    sendText(400, error);
    return;
  }
  saveSettings(next);
  sendText(200, "Saved. Restarting...");
  delay(500);
  ESP.restart();
}
}  // namespace

void webBegin(Settings& settings, LogStore& store, const WebHooks& hooks) {
  gSettings = &settings;
  gStore = &store;
  gHooks = hooks;
  const char* headers[] = {"X-Sakshi-Pin", "Origin"};
  server.collectHeaders(headers, 2);
  server.on("/", HTTP_GET, [] {
    if (guard(false)) sendPage(kStatusBody);
  });
  server.on("/setup", HTTP_GET, [] {
    if (guard(false)) sendPage(kSetupBody);
  });
  server.on("/api/status", HTTP_GET, handleStatus);
  server.on("/api/log", HTTP_GET, handleLog);
  server.on("/api/digests", HTTP_GET, handleDigests);
  server.on("/api/test", HTTP_POST, handleTest);
  server.on("/setup", HTTP_POST, handleSetupSave);
  server.onNotFound([] { sendText(404, "not found"); });
  server.begin();
}

void webLoop() { server.handleClient(); }
