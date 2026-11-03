// Meter Sakshi: a non-contact check meter.
//
// Counts the flashes of the electricity meter's own pulse LED through an optical sensor
// held over it by a clip, logs one record per minute to flash, and serves a local web
// page for status, CSV export and home tests. The device never opens, wires into or
// alters the meter; its only electrical connections are to its own USB supply.
#include <Arduino.h>
#include <WiFi.h>
#include <time.h>

#ifdef SAKSHI_USE_DS3231
#include <RTClib.h>
#endif

#include "config.h"
#include "pulse_filter.h"
#include "record.h"
#include "settings.h"
#include "storage.h"
#include "web.h"

namespace {

Settings settings;
LogStore store;

// ---- pulse counting (ISR side) ----
portMUX_TYPE pulseMux = portMUX_INITIALIZER_UNLOCKED;
sakshi::PulseFilter filter(defaults::kFilterUs);
volatile uint32_t pulseCount = 0;
volatile uint32_t rejectedTotal = 0;
volatile bool ledFlash = false;

void IRAM_ATTR onPulseEdge() {
  const uint32_t now = static_cast<uint32_t>(micros());
  portENTER_CRITICAL_ISR(&pulseMux);
  if (filter.accept(now)) {
    pulseCount = pulseCount + 1;
    ledFlash = true;
  } else {
    rejectedTotal = filter.rejected();
  }
  portEXIT_CRITICAL_ISR(&pulseMux);
}

uint32_t takePulses() {
  portENTER_CRITICAL(&pulseMux);
  const uint32_t pulses = pulseCount;
  pulseCount = 0;
  portEXIT_CRITICAL(&pulseMux);
  return pulses;
}

// ---- minute bookkeeping (loop side) ----
struct PendingMinute {
  uint32_t bootMinute;
  uint16_t pulses;
  uint8_t flags;
};

PendingMinute pending[defaults::kPendingMinutes];
uint16_t pendingCount = 0;
uint32_t lastClosedEpochMinute = 0;
uint32_t lastClosedBootMinute = 0;
bool firstRecord = true;
bool supplyLostThisMinute = false;
uint32_t rejectsAtMinuteStart = 0;
uint32_t lastMinutePulses = 0;

enum class TestMode { kNone, kCreep, kReference };
TestMode testMode = TestMode::kNone;
uint32_t testEndsBootMinute = 0;

#ifdef SAKSHI_USE_DS3231
RTC_DS3231 rtc;
bool rtcPresent = false;
#endif

uint32_t lastStoredEpoch = 0;  // this session only
uint32_t lastStoredBoot = 0;

uint32_t bootMinuteNow() { return static_cast<uint32_t>(millis() / 60000UL); }

bool clockSynced() { return time(nullptr) > 1700000000; }  // after Nov 2023

// The wall clock is trusted only if it agrees with the uptime clock since the last stored
// record (within a day). A spoofed NTP reply cannot push the log into the future.
bool clockTrusted() {
  if (!clockSynced()) return false;
  if (lastStoredEpoch == 0) return true;
  const int64_t now = static_cast<int64_t>(time(nullptr) / 60);
  const int64_t expected = static_cast<int64_t>(lastStoredEpoch) + static_cast<int64_t>(bootMinuteNow() - lastStoredBoot);
  const int64_t drift = now - expected;
  return drift <= defaults::kMaxClockJumpMinutes && drift >= -defaults::kMaxClockJumpMinutes;
}

uint8_t minuteFlags(uint32_t pulses, uint32_t bootMinute) {
  uint8_t flags = 0;
  if (supplyLostThisMinute) flags |= sakshi::kSupplyLost;
  if (testMode == TestMode::kCreep && bootMinute < testEndsBootMinute) flags |= sakshi::kCreepTest;
  if (testMode == TestMode::kReference && bootMinute < testEndsBootMinute) flags |= sakshi::kReferenceTest;
  const uint32_t rejects = rejectedTotal - rejectsAtMinuteStart;
  if (rejects > defaults::kFaultRejectsPerMinute) flags |= sakshi::kSensorFault;
  if (firstRecord) flags |= sakshi::kBoot;
  (void)pulses;
  return flags;
}

void storeRecord(uint32_t epochMinute, uint32_t pulses, uint8_t flags) {
  const sakshi::Record record{epochMinute, static_cast<uint16_t>(pulses > 0xFFFF ? 0xFFFF : pulses), flags, 0};
  if (store.append(record)) {
    firstRecord = false;
    lastStoredEpoch = epochMinute;
    lastStoredBoot = bootMinuteNow();
  }
}

// Minutes counted before the clock was set get timestamps derived from the boot clock
// and the CLOCK_UNSYNCED flag, so nothing is lost and nothing is passed off as exact.
void flushPending(uint32_t nowEpochMinute, uint32_t nowBootMinute) {
  for (uint16_t i = 0; i < pendingCount; ++i) {
    const uint32_t epoch = nowEpochMinute - (nowBootMinute - pending[i].bootMinute);
    storeRecord(epoch, pending[i].pulses, pending[i].flags | sakshi::kClockUnsynced);
  }
  pendingCount = 0;
}

void closeMinute(uint32_t bootMinute) {
  const uint32_t pulses = takePulses();
  lastMinutePulses = pulses;
  const uint8_t flags = minuteFlags(pulses, bootMinute);
  rejectsAtMinuteStart = rejectedTotal;
  supplyLostThisMinute = false;

  if (!clockTrusted()) {
    if (clockSynced()) Serial.println("Wall clock disagrees with uptime by more than a day; counting on the boot clock.");
    if (pendingCount == defaults::kPendingMinutes) {
      memmove(pending, pending + 1, sizeof(PendingMinute) * (defaults::kPendingMinutes - 1));
      --pendingCount;
    }
    pending[pendingCount++] = {bootMinute, static_cast<uint16_t>(pulses > 0xFFFF ? 0xFFFF : pulses), flags};
    firstRecord = false;
    return;
  }
  const uint32_t nowEpochMinute = static_cast<uint32_t>(time(nullptr) / 60);
  if (pendingCount > 0) flushPending(nowEpochMinute, bootMinuteNow());
  // The minute just closed is the one before the current wall-clock minute.
  storeRecord(nowEpochMinute - 1, pulses, flags);
  lastClosedEpochMinute = nowEpochMinute - 1;
}

void startWifi() {
  if (settings.wifiSsid.length() > 0) {
    WiFi.mode(WIFI_STA);
    WiFi.setHostname(settings.deviceId.c_str());
    WiFi.begin(settings.wifiSsid.c_str(), settings.wifiPass.c_str());
    const uint32_t started = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - started < defaults::kWifiConnectTimeoutMs) delay(250);
    if (WiFi.status() == WL_CONNECTED) {
      Serial.printf("Wi-Fi connected: http://%s/\n", WiFi.localIP().toString().c_str());
      return;
    }
  }
  // Setup access point. Its password is random (generated on first boot, stored in NVS)
  // and printed on serial: write it on the device label.
  const String apName = "MeterSakshi-" + settings.deviceId.substring(3);
  WiFi.mode(WIFI_AP);
  WiFi.softAP(apName.c_str(), settings.apPassword.c_str());
  Serial.printf("Access point %s (password %s): http://%s/\n", apName.c_str(), settings.apPassword.c_str(), WiFi.softAPIP().toString().c_str());
}

void startClock() {
  configTime(0, 0, "pool.ntp.org", "time.google.com", "time.cloudflare.com");
#ifdef SAKSHI_USE_DS3231
  rtcPresent = rtc.begin();
  if (rtcPresent && !rtc.lostPower() && !clockSynced()) {
    const timeval tv{static_cast<time_t>(rtc.now().unixtime()), 0};
    settimeofday(&tv, nullptr);
  }
#endif
}

void syncRtcFromNtp() {
#ifdef SAKSHI_USE_DS3231
  static uint32_t lastWrite = 0;
  if (rtcPresent && clockSynced() && WiFi.status() == WL_CONNECTED && millis() - lastWrite > 6UL * 3600UL * 1000UL) {
    rtc.adjust(DateTime(static_cast<uint32_t>(time(nullptr))));
    lastWrite = millis();
  }
#endif
}

// Hold BOOT for 5 seconds while powering on to clear a forgotten PIN (logs are kept).
void checkPinReset() {
  pinMode(pins::kResetButton, INPUT_PULLUP);
  const uint32_t started = millis();
  while (digitalRead(pins::kResetButton) == LOW) {
    if (millis() - started > 5000) {
      clearPin(settings);
      Serial.println("PIN cleared. Open Setup over the access point to choose a new one.");
      return;
    }
    delay(20);
  }
}

LiveStatus liveStatus() {
  const uint32_t nowBoot = bootMinuteNow();
  const bool testing = testMode != TestMode::kNone && nowBoot < testEndsBootMinute;
  return LiveStatus{
      clockTrusted(),
      digitalRead(pins::kSupplySense) == HIGH,
      lastMinutePulses,
      settings.impPerKwh ? (lastMinutePulses * 60000.0f) / settings.impPerKwh : 0.0f,
      rejectedTotal,
      !testing ? "none" : (testMode == TestMode::kCreep ? "creep" : "reference"),
      testing ? testEndsBootMinute - nowBoot : 0,
      pendingCount,
  };
}

void startTest(const String& mode, uint32_t minutes) {
  testMode = mode == "creep" ? TestMode::kCreep : (mode == "reference" ? TestMode::kReference : TestMode::kNone);
  // Tests begin at the next whole minute so the flagged window is exact.
  testEndsBootMinute = bootMinuteNow() + 1 + minutes;
}

}  // namespace

void setup() {
  Serial.begin(115200);
  pinMode(pins::kStatusLed, OUTPUT);
  pinMode(pins::kSupplySense, INPUT);
  pinMode(pins::kPulse, INPUT_PULLUP);

  settings = loadSettings();
  checkPinReset();
  filter.setMinInterval(settings.filterUs);
  Serial.printf("\nMeter Sakshi %s, device %s\n", SAKSHI_FIRMWARE_VERSION, settings.deviceId.c_str());

  startWifi();
  startClock();
  webBegin(settings, store, WebHooks{liveStatus, startTest});

  if (!settings.configured()) {
    Serial.println("Meter constant not set: open the web page and enter the imp/kWh printed on the meter.");
    return;  // no logging until the constant is known; the web UI still runs
  }
  if (!store.begin(settings.deviceId, settings.impPerKwh)) {
    Serial.println("ERROR: could not mount the log filesystem.");
    return;
  }
  lastClosedBootMinute = bootMinuteNow();
  attachInterrupt(digitalPinToInterrupt(pins::kPulse), onPulseEdge, settings.pulseActiveLow ? FALLING : RISING);
}

void loop() {
  webLoop();
  if (ledFlash) {
    ledFlash = false;
    digitalWrite(pins::kStatusLed, HIGH);
    delay(20);
    digitalWrite(pins::kStatusLed, LOW);
  }
  if (!settings.configured()) {
    delay(10);
    return;
  }
  if (digitalRead(pins::kSupplySense) == LOW) supplyLostThisMinute = true;

  if (clockTrusted()) {
    const uint32_t epochMinute = static_cast<uint32_t>(time(nullptr) / 60);
    if (lastClosedEpochMinute == 0) lastClosedEpochMinute = epochMinute - 1;  // first synced minute: wait for a full one
    if (epochMinute - 1 > lastClosedEpochMinute) closeMinute(bootMinuteNow());
    lastClosedBootMinute = bootMinuteNow();  // so the boot-clock path resumes from here if trust is lost
  } else {
    const uint32_t bootMinute = bootMinuteNow();
    if (bootMinute > lastClosedBootMinute) {
      closeMinute(lastClosedBootMinute);
      lastClosedBootMinute = bootMinute;
    }
  }
  syncRtcFromNtp();
  delay(5);
}
