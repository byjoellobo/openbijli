// Meter Sakshi log record and hash chain, matching packages/evidence (log format v1).
//
//   genesis = SHA-256("meter-sakshi|v1|" + device_id + "|" + imp_per_kwh)
//   hash_i  = SHA-256(hash_{i-1} + "|" + minute_utc + "|" + pulses + "|" + flags)
//
// On flash each minute is stored as 8 bytes (no hash). Hashes are recomputed on export,
// and each day's final hash is kept in a digest file that the user can publish.
#pragma once

#include <cstdint>
#include <string>

namespace sakshi {

enum Flag : uint8_t {
  kSupplyLost = 1,
  kClockUnsynced = 2,
  kCreepTest = 4,
  kReferenceTest = 8,
  kSensorFault = 16,
  kBoot = 32,
};

#pragma pack(push, 1)
struct Record {
  uint32_t epochMinute;  // minutes since 1970-01-01T00:00Z
  uint16_t pulses;
  uint8_t flags;
  uint8_t reserved;  // keeps records 8 bytes; always 0
};
#pragma pack(pop)
static_assert(sizeof(Record) == 8, "Record must stay 8 bytes on flash");

// "YYYY-MM-DDTHH:MMZ" (17 chars + NUL).
void formatMinute(uint32_t epochMinute, char out[18]);
// UTC date "YYYYMMDD" (8 chars + NUL), used for daily file names.
void formatDay(uint32_t epochMinute, char out[9]);

std::string genesisHash(const std::string& deviceId, uint32_t impPerKwh);
std::string nextHash(const std::string& previousHash, const Record& record);
// "minute_utc,pulses,flags,hash"
std::string csvLine(const Record& record, const std::string& hash);

}  // namespace sakshi
