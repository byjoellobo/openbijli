// Persistent settings in NVS (written only when the user saves the setup form).
#pragma once

#include <Arduino.h>

struct Settings {
  String deviceId;      // MS-XXXXXX from the chip MAC; never user-editable
  uint32_t impPerKwh;   // meter constant printed on the meter; 0 = not configured
  uint32_t filterUs;    // debounce interval
  bool pulseActiveLow;
  String wifiSsid;
  String wifiPass;
  String meterSerial;   // optional, consumer-entered, shown in exports
  String pinSalt;       // random, per device
  String pinHash;       // SHA-256(salt + PIN); empty until the owner sets a PIN
  String apPassword;    // random setup access-point password, generated on first boot

  bool configured() const { return impPerKwh > 0; }
  bool hasPin() const { return pinHash.length() == 64; }
};

Settings loadSettings();
void saveSettings(const Settings& settings);

// Sets a new PIN (fresh salt). The PIN must already be validated.
void setPin(Settings& settings, const String& pin);
// Constant-time check of a PIN against the stored hash.
bool pinMatches(const Settings& settings, const String& pin);
// Clears the PIN (physical reset path). Logs and meter settings are kept.
void clearPin(Settings& settings);

// Validation for values arriving from the web form. Returns an empty string when valid.
String validateImp(long value);
String validateFilter(long value);
String validatePin(const String& pin);
String validateText(const String& value, size_t maxLength, const char* field);
