# Meter Sakshi log format, version 1

A UTF-8 CSV file with comment headers. Implemented by the firmware
(`firmware/lib/sakshi_core/record.cpp`) and the evidence engine
(`packages/evidence/src/log/`). Both are tested against the same vectors.

```
# meter-sakshi-log v1
# device_id=MS-1A2B3C
# imp_per_kwh=3200
# firmware=0.1.0
# meter_serial=XY123456          (optional, consumer-entered)
# chain_prev=<64 hex>            (optional: hash before the first record of this export)
minute_utc,pulses,flags,hash
2026-09-30T18:30Z,5,32,10059c403f2f7711c6d389efd9a85a17232654dc102e2f9636b21000906624c9
2026-09-30T18:31Z,6,0,830c30e445595ac38b1c66a6c5f35983db864143e6ff17c88feacf1eb98b1165
# digest 2026-09-30 <64 hex>     (hash of that UTC day's last record)
```

## Fields

| Field | Meaning |
|---|---|
| `minute_utc` | Start of the minute, `YYYY-MM-DDTHH:MMZ`, strictly increasing. Missing minutes mean the device was off. |
| `pulses` | Accepted LED pulses in that minute (0-65535). Energy = pulses / imp_per_kwh kWh. |
| `flags` | Bit field, below. |
| `hash` | Lowercase hex SHA-256 chaining this record to the previous one. |

| Bit | Name | Meaning |
|---|---|---|
| 1 | `SUPPLY_LOST` | Household supply absent at some point in the minute; device on battery |
| 2 | `CLOCK_UNSYNCED` | Minute counted before the clock was set; time derived from the boot clock |
| 4 | `CREEP_TEST` | User-started no-load test in progress |
| 8 | `REFERENCE_TEST` | User-started reference-load test in progress |
| 16 | `SENSOR_FAULT` | Many rejected edges (light leak, flicker); pulses may be missed |
| 32 | `BOOT` | First record after a restart |

## Hash chain

```
genesis = SHA-256("meter-sakshi|v1|" + device_id + "|" + imp_per_kwh)
hash_i  = SHA-256(hash_{i-1} + "|" + minute_utc + "|" + pulses + "|" + flags)
```

`pulses` and `flags` are written in decimal with no padding. The first record of a full log
chains from `genesis`; a partial export states `chain_prev`, the hash of the record before its
first one (the previous day's digest).

Test vectors (device `MS-DEMO01`, 3200 imp/kWh):

| Input | SHA-256 |
|---|---|
| genesis | `f9ff691e4d1194e59ce545631711600dcfeb74a08901b16ca8b10f3497f6e0a5` |
| `2026-09-30T18:30Z`, 5, 32 | `10059c403f2f7711c6d389efd9a85a17232654dc102e2f9636b21000906624c9` |
| `2026-09-30T18:31Z`, 6, 0 | `830c30e445595ac38b1c66a6c5f35983db864143e6ff17c88feacf1eb98b1165` |

## On the device

Records are stored as 8 bytes each (`uint32` epoch minute, `uint16` pulses, `uint8` flags, one
reserved byte) in `/log/YYYYMMDD.bin`, about 11 KB a day. Hashes are recomputed on export. When
a UTC day closes, its final hash is appended to `/digests.csv`.

## What the chain does and does not prove

It shows that an export has not been edited since it was produced, and that it continues from
any digest you shared earlier. It cannot stop the owner of a device from fabricating a log from
scratch: that is why digests should be shared with a third party as days close, and why the
report states its limits. Changing `imp_per_kwh` starts a new chain.
