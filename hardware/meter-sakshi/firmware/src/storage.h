// Minute records on LittleFS: /log/YYYYMMDD.bin (8 bytes per minute, UTC day) and
// /digests.csv (one "YYYY-MM-DD,<hash>" line per closed day). Hashes are recomputed on
// export so the flash holds about 11 KB per day; the digest file lets an export prove
// continuity from a hash that was shown or shared earlier.
#pragma once

#include <Arduino.h>
#include <functional>

#include "record.h"

class LogStore {
 public:
  bool begin(const String& deviceId, uint32_t impPerKwh);
  // Appends a record; returns false if it is not later than the last stored minute.
  bool append(const sakshi::Record& record);

  uint32_t lastMinute() const { return lastMinute_; }
  const std::string& chainHash() const { return chainHash_; }
  uint32_t recordsToday() const { return recordsToday_; }
  uint32_t pulsesToday() const { return pulsesToday_; }
  String lastDigestLine() const { return lastDigest_; }

  // Streams a CSV export for UTC days [fromDay, toDay] (YYYYMMDD) through `write`.
  void exportCsv(const String& fromDay, const String& toDay, const String& firmware, const String& meterSerial,
                 const std::function<void(const String&)>& write);
  // Streams /digests.csv.
  void exportDigests(const std::function<void(const String&)>& write);

 private:
  String dayPath(const char* day) const;
  std::string digestBefore(const String& day) const;
  void closeDay(uint32_t minuteOfClosedDay);
  void enforceFreeSpace();
  void recoverChain();

  String deviceId_;
  uint32_t impPerKwh_ = 0;
  std::string genesis_;
  std::string chainHash_;
  uint32_t lastMinute_ = 0;
  uint32_t recordsToday_ = 0;
  uint32_t pulsesToday_ = 0;
  String lastDigest_;
};
