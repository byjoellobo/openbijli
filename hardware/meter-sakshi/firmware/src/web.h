// Local web interface: status page, CSV export, test modes and setup.
#pragma once

#include <Arduino.h>
#include <functional>

#include "settings.h"
#include "storage.h"

struct LiveStatus {
  bool clockSynced;
  bool supplyPresent;
  uint32_t lastMinutePulses;
  float watts;
  uint32_t rejectedEdges;
  const char* testMode;  // "none", "creep" or "reference"
  uint32_t testMinutesLeft;
  uint16_t pendingMinutes;
};

struct WebHooks {
  std::function<LiveStatus()> status;
  std::function<void(const String& mode, uint32_t minutes)> startTest;
};

void webBegin(Settings& settings, LogStore& store, const WebHooks& hooks);
void webLoop();
