// Software debounce for the meter LED signal. A pulse is accepted only if it arrives
// at least `minIntervalUs` after the previous ACCEPTED pulse, which rejects comparator
// chatter on the LED's edges without limiting real pulse rates.
//
// Choose minIntervalUs below the shortest real interval at maximum load:
//   interval_s = 3600 / (imp_per_kwh * max_kw)
//   e.g. 3200 imp/kWh, 60 A x 240 V = 14.4 kW  ->  78 ms; a 15 ms filter is safe.
#pragma once

#include <cstdint>

namespace sakshi {

class PulseFilter {
 public:
  explicit PulseFilter(uint32_t minIntervalUs) : minIntervalUs_(minIntervalUs) {}

  // Call from the ISR with a free-running microsecond clock. Wrap-around safe.
  bool accept(uint32_t nowUs) {
    if (hasAccepted_ && static_cast<uint32_t>(nowUs - lastAcceptedUs_) < minIntervalUs_) {
      ++rejected_;
      return false;
    }
    hasAccepted_ = true;
    lastAcceptedUs_ = nowUs;
    return true;
  }

  uint32_t rejected() const { return rejected_; }
  void setMinInterval(uint32_t us) { minIntervalUs_ = us; }

 private:
  uint32_t minIntervalUs_;
  uint32_t lastAcceptedUs_ = 0;
  uint32_t rejected_ = 0;
  bool hasAccepted_ = false;
};

// Shortest safe debounce for a meter: 90% of the pulse interval at maximum power.
inline uint32_t maxSafeFilterUs(uint32_t impPerKwh, float maxKw) {
  if (impPerKwh == 0 || maxKw <= 0) return 0;
  const double intervalUs = 3600.0e6 / (static_cast<double>(impPerKwh) * maxKw);
  return static_cast<uint32_t>(intervalUs * 0.9);
}

}  // namespace sakshi
