#include "storage.h"

#include <LittleFS.h>

#include <algorithm>
#include <vector>

#include "config.h"

using sakshi::Record;

namespace {
constexpr const char* kLogDir = "/log";
constexpr const char* kDigestFile = "/digests.csv";

String isoDay(const String& yyyymmdd) {
  return yyyymmdd.substring(0, 4) + "-" + yyyymmdd.substring(4, 6) + "-" + yyyymmdd.substring(6, 8);
}

std::vector<String> sortedDayFiles() {
  std::vector<String> days;
  File dir = LittleFS.open(kLogDir);
  if (!dir || !dir.isDirectory()) return days;
  for (File f = dir.openNextFile(); f; f = dir.openNextFile()) {
    String name = f.name();
    const int slash = name.lastIndexOf('/');
    if (slash >= 0) name = name.substring(slash + 1);
    if (name.length() == 12 && name.endsWith(".bin")) days.push_back(name.substring(0, 8));
  }
  std::sort(days.begin(), days.end(), [](const String& a, const String& b) { return a < b; });
  return days;
}
}  // namespace

String LogStore::dayPath(const char* day) const { return String(kLogDir) + "/" + day + ".bin"; }

bool LogStore::begin(const String& deviceId, uint32_t impPerKwh) {
  if (!LittleFS.begin(true)) return false;
  if (!LittleFS.exists(kLogDir)) LittleFS.mkdir(kLogDir);
  deviceId_ = deviceId;
  impPerKwh_ = impPerKwh;
  genesis_ = sakshi::genesisHash(deviceId.c_str(), impPerKwh);
  recoverChain();
  return true;
}

// Rebuild the running hash: start from the last stored digest (or genesis) and replay
// every record in day files after that digest's day.
void LogStore::recoverChain() {
  chainHash_ = genesis_;
  String lastDigestDay;
  File digests = LittleFS.open(kDigestFile, "r");
  while (digests && digests.available()) {
    const String line = digests.readStringUntil('\n');
    const int comma = line.indexOf(',');
    if (comma == 10) {
      lastDigestDay = line.substring(0, 4) + line.substring(5, 7) + line.substring(8, 10);
      chainHash_ = std::string(line.substring(comma + 1, comma + 65).c_str());
      lastDigest_ = line;
    }
  }
  if (digests) digests.close();

  for (const String& day : sortedDayFiles()) {
    if (lastDigestDay.length() > 0 && day <= lastDigestDay) continue;
    File f = LittleFS.open(dayPath(day.c_str()), "r");
    Record r{};
    recordsToday_ = 0;
    pulsesToday_ = 0;
    while (f && f.read(reinterpret_cast<uint8_t*>(&r), sizeof(r)) == sizeof(r)) {
      chainHash_ = sakshi::nextHash(chainHash_, r);
      lastMinute_ = r.epochMinute;
      ++recordsToday_;
      pulsesToday_ += r.pulses;
    }
    if (f) f.close();
  }
}

void LogStore::closeDay(uint32_t minuteOfClosedDay) {
  char day[9];
  sakshi::formatDay(minuteOfClosedDay, day);
  const String line = isoDay(day) + "," + chainHash_.c_str();
  File digests = LittleFS.open(kDigestFile, "a");
  if (digests) {
    digests.println(line);
    digests.close();
  }
  lastDigest_ = line;
  recordsToday_ = 0;
  pulsesToday_ = 0;
}

void LogStore::enforceFreeSpace() {
  while (LittleFS.totalBytes() - LittleFS.usedBytes() < defaults::kMinFreeBytes) {
    const std::vector<String> days = sortedDayFiles();
    if (days.size() <= 1) return;
    LittleFS.remove(dayPath(days.front().c_str()));
  }
}

bool LogStore::append(const Record& record) {
  if (lastMinute_ != 0 && record.epochMinute <= lastMinute_) return false;
  if (lastMinute_ != 0 && record.epochMinute / 1440 != lastMinute_ / 1440) closeDay(lastMinute_);
  enforceFreeSpace();
  char day[9];
  sakshi::formatDay(record.epochMinute, day);
  File f = LittleFS.open(dayPath(day), "a");
  if (!f) return false;
  const size_t written = f.write(reinterpret_cast<const uint8_t*>(&record), sizeof(record));
  f.close();
  if (written != sizeof(record)) return false;
  chainHash_ = sakshi::nextHash(chainHash_, record);
  lastMinute_ = record.epochMinute;
  ++recordsToday_;
  pulsesToday_ += record.pulses;
  return true;
}

std::string LogStore::digestBefore(const String& day) const {
  std::string hash;
  File digests = LittleFS.open(kDigestFile, "r");
  while (digests && digests.available()) {
    const String line = digests.readStringUntil('\n');
    if (line.length() < 75) continue;
    const String lineDay = line.substring(0, 4) + line.substring(5, 7) + line.substring(8, 10);
    if (lineDay < day) hash = std::string(line.substring(11, 75).c_str());
  }
  if (digests) digests.close();
  return hash;
}

void LogStore::exportCsv(const String& fromDay, const String& toDay, const String& firmware, const String& meterSerial,
                         const std::function<void(const String&)>& write) {
  const std::vector<String> days = sortedDayFiles();
  const bool fromStart = days.empty() || fromDay <= days.front();
  std::string previous = fromStart ? genesis_ : digestBefore(fromDay);
  if (previous.empty()) previous = genesis_;

  write("# meter-sakshi-log v1\n# device_id=" + deviceId_ + "\n# imp_per_kwh=" + String(impPerKwh_) + "\n# firmware=" + firmware + "\n");
  if (meterSerial.length() > 0) write("# meter_serial=" + meterSerial + "\n");
  if (!fromStart) write(String("# chain_prev=") + previous.c_str() + "\n");
  write("minute_utc,pulses,flags,hash\n");

  for (const String& day : days) {
    if (day < fromDay || day > toDay) continue;
    File f = LittleFS.open(dayPath(day.c_str()), "r");
    Record r{};
    String chunk;
    while (f && f.read(reinterpret_cast<uint8_t*>(&r), sizeof(r)) == sizeof(r)) {
      previous = sakshi::nextHash(previous, r);
      chunk += sakshi::csvLine(r, previous).c_str();
      chunk += "\n";
      if (chunk.length() > 2048) {
        write(chunk);
        chunk = "";
      }
    }
    if (f) f.close();
    if (chunk.length() > 0) write(chunk);
    write("# digest " + isoDay(day) + " " + previous.c_str() + "\n");
  }
}

void LogStore::exportDigests(const std::function<void(const String&)>& write) {
  write("day,hash\n");
  File digests = LittleFS.open(kDigestFile, "r");
  while (digests && digests.available()) write(digests.readStringUntil('\n') + "\n");
  if (digests) digests.close();
}
