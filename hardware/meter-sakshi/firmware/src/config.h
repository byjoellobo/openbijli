// Meter Sakshi hardware configuration. See ../README.md for the wiring diagram.
#pragma once

#include <cstdint>

#ifndef SAKSHI_FIRMWARE_VERSION
#define SAKSHI_FIRMWARE_VERSION "0.1.0"
#endif

namespace pins {
// Digital output of the optical sensor (LM393 photodiode module DO, or TSLR257 + comparator).
constexpr int kPulse = 27;
// HIGH while the household USB adapter is powered (5 V through a 100k/100k divider).
// Input-only pin; it must never be connected to anything inside the meter.
constexpr int kSupplySense = 34;
constexpr int kStatusLed = 2;
// The DevKit's BOOT button. Held for 5 s while powering on, it clears the PIN.
constexpr int kResetButton = 0;
}  // namespace pins

namespace defaults {
// Most LM393 photodiode modules pull DO low when light exceeds the threshold.
constexpr bool kPulseActiveLow = true;
// Debounce: well below the 78 ms pulse interval of a 3200 imp/kWh meter at 14.4 kW.
constexpr uint32_t kFilterUs = 15000;
// Rejected edges in one minute above this mark the minute SENSOR_FAULT (light leak, flicker).
constexpr uint32_t kFaultRejectsPerMinute = 20;
// Free space to keep on the log filesystem; the oldest day file is deleted below this.
constexpr uint32_t kMinFreeBytes = 64 * 1024;
// Minutes kept in RAM while the clock is not yet set (one day).
constexpr uint16_t kPendingMinutes = 1440;
constexpr uint32_t kWifiConnectTimeoutMs = 20000;
constexpr uint32_t kMaxTestMinutes = 120;
// A wall-clock change of more than this against the uptime clock is distrusted (NTP spoofing).
constexpr int64_t kMaxClockJumpMinutes = 1440;
}  // namespace defaults
