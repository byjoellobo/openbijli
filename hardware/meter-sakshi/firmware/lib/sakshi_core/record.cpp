#include "record.h"

#include <cstdio>

#include "sha256.h"

namespace sakshi {
namespace {

// Howard Hinnant's civil_from_days: days since 1970-01-01 -> year/month/day.
void civilFromDays(int64_t days, int& year, unsigned& month, unsigned& day) {
  days += 719468;
  const int64_t era = (days >= 0 ? days : days - 146096) / 146097;
  const unsigned doe = static_cast<unsigned>(days - era * 146097);
  const unsigned yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
  const unsigned doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  const unsigned mp = (5 * doy + 2) / 153;
  day = doy - (153 * mp + 2) / 5 + 1;
  month = mp < 10 ? mp + 3 : mp - 9;
  year = static_cast<int>(yoe) + static_cast<int>(era) * 400 + (month <= 2 ? 1 : 0);
}

}  // namespace

void formatMinute(uint32_t epochMinute, char out[18]) {
  int year;
  unsigned month, day;
  civilFromDays(epochMinute / 1440, year, month, day);
  const unsigned minuteOfDay = epochMinute % 1440;
  std::snprintf(out, 18, "%04d-%02u-%02uT%02u:%02uZ", year, month, day, minuteOfDay / 60, minuteOfDay % 60);
}

void formatDay(uint32_t epochMinute, char out[9]) {
  int year;
  unsigned month, day;
  civilFromDays(epochMinute / 1440, year, month, day);
  std::snprintf(out, 9, "%04d%02u%02u", year, month, day);
}

std::string genesisHash(const std::string& deviceId, uint32_t impPerKwh) {
  return sha256Hex("meter-sakshi|v1|" + deviceId + "|" + std::to_string(impPerKwh));
}

std::string nextHash(const std::string& previousHash, const Record& record) {
  char minute[18];
  formatMinute(record.epochMinute, minute);
  return sha256Hex(previousHash + "|" + minute + "|" + std::to_string(record.pulses) + "|" + std::to_string(record.flags));
}

std::string csvLine(const Record& record, const std::string& hash) {
  char minute[18];
  formatMinute(record.epochMinute, minute);
  return std::string(minute) + "," + std::to_string(record.pulses) + "," + std::to_string(record.flags) + "," + hash;
}

}  // namespace sakshi
