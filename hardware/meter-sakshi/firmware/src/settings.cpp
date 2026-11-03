#include "settings.h"

#include <Preferences.h>
#include <esp_mac.h>
#include <esp_random.h>

#include "config.h"
#include "sha256.h"

namespace {
constexpr const char* kNamespace = "sakshi";

String macDeviceId() {
  uint8_t mac[6] = {0};
  esp_read_mac(mac, ESP_MAC_WIFI_STA);
  char id[16];
  snprintf(id, sizeof(id), "MS-%02X%02X%02X", mac[3], mac[4], mac[5]);
  return String(id);
}

// Random string from an alphabet without look-alike characters (no 0/O, 1/l/I).
String randomToken(size_t length) {
  static const char kAlphabet[] = "abcdefghijkmnpqrstuvwxyz23456789";
  String out;
  out.reserve(length);
  for (size_t i = 0; i < length; ++i) out += kAlphabet[esp_random() % (sizeof(kAlphabet) - 1)];
  return out;
}

String hashPin(const String& salt, const String& pin) {
  return String(sakshi::sha256Hex(std::string(salt.c_str()) + std::string(pin.c_str())).c_str());
}
}  // namespace

Settings loadSettings() {
  Preferences prefs;
  prefs.begin(kNamespace, false);
  Settings s;
  s.deviceId = macDeviceId();
  s.impPerKwh = prefs.getUInt("imp", 0);
  s.filterUs = prefs.getUInt("filter", defaults::kFilterUs);
  s.pulseActiveLow = prefs.getBool("activeLow", defaults::kPulseActiveLow);
  s.wifiSsid = prefs.getString("ssid", "");
  s.wifiPass = prefs.getString("pass", "");
  s.meterSerial = prefs.getString("serial", "");
  s.pinSalt = prefs.getString("pinSalt", "");
  s.pinHash = prefs.getString("pinHash", "");
  s.apPassword = prefs.getString("apPass", "");
  if (s.apPassword.length() < 12) {
    // Generated once, never derived from the MAC or SSID; printed on serial for the label.
    s.apPassword = randomToken(12);
    prefs.putString("apPass", s.apPassword);
  }
  prefs.end();
  return s;
}

void saveSettings(const Settings& s) {
  Preferences prefs;
  prefs.begin(kNamespace, false);
  prefs.putUInt("imp", s.impPerKwh);
  prefs.putUInt("filter", s.filterUs);
  prefs.putBool("activeLow", s.pulseActiveLow);
  prefs.putString("ssid", s.wifiSsid);
  prefs.putString("pass", s.wifiPass);
  prefs.putString("serial", s.meterSerial);
  prefs.putString("pinSalt", s.pinSalt);
  prefs.putString("pinHash", s.pinHash);
  prefs.putString("apPass", s.apPassword);
  prefs.end();
}

void setPin(Settings& s, const String& pin) {
  s.pinSalt = randomToken(16);
  s.pinHash = hashPin(s.pinSalt, pin);
}

bool pinMatches(const Settings& s, const String& pin) {
  if (!s.hasPin() || pin.length() == 0) return false;
  const String candidate = hashPin(s.pinSalt, pin);
  uint8_t diff = 0;
  for (size_t i = 0; i < 64; ++i) diff |= static_cast<uint8_t>(candidate[i] ^ s.pinHash[i]);
  return diff == 0;
}

void clearPin(Settings& s) {
  s.pinSalt = "";
  s.pinHash = "";
  saveSettings(s);
}

String validateImp(long value) {
  return (value >= 100 && value <= 100000) ? "" : "Meter constant must be 100-100000 imp/kWh (read it from the meter label).";
}

String validateFilter(long value) {
  return (value >= 1000 && value <= 200000) ? "" : "Debounce must be 1000-200000 microseconds.";
}

String validatePin(const String& pin) {
  if (pin.length() < 6 || pin.length() > 12) return "PIN must be 6-12 digits.";
  for (size_t i = 0; i < pin.length(); ++i) {
    if (!isDigit(pin[i])) return "PIN must contain digits only.";
  }
  return "";
}

String validateText(const String& value, size_t maxLength, const char* field) {
  if (value.length() > maxLength) return String(field) + " is too long.";
  for (size_t i = 0; i < value.length(); ++i) {
    const uint8_t c = static_cast<uint8_t>(value[i]);
    if (c < 0x20 || c == 0x7f) return String(field) + " contains control characters.";
  }
  return "";
}
