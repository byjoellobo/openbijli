// Portable SHA-256 (FIPS 180-4). Used on the ESP32 and in native unit tests so the
// device and the TypeScript evidence engine provably hash the same bytes.
#pragma once

#include <cstddef>
#include <cstdint>
#include <string>

namespace sakshi {

class Sha256 {
 public:
  Sha256();
  void update(const uint8_t* data, size_t length);
  void update(const std::string& text);
  // Finalises and writes 64 lowercase hex characters plus a terminating NUL.
  void finishHex(char out[65]);

 private:
  void compress(const uint8_t block[64]);
  uint32_t state_[8];
  uint8_t buffer_[64];
  uint64_t bitLength_;
  size_t bufferLength_;
};

// Convenience: SHA-256 of a string as 64 lowercase hex characters.
std::string sha256Hex(const std::string& text);

}  // namespace sakshi
