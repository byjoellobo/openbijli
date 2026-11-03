# Meter Sakshi

*Sakshi* (साक्षी) means witness. Meter Sakshi is a non-contact check meter: an ESP32 with an
optical sensor held by a 3D-printed clip over the kWh pulse LED on the outside of your
electricity meter. It logs the meter's own pulses minute by minute, records when household
supply drops and returns, and exports a hash-chained log that the
[OpenBijli](../../README.md) evidence engine
([`@openbijli/evidence`](../../packages/evidence/README.md)) turns into a dispute report.
You can try the report builder with demo data in the
[web app](https://byjoellobo.github.io/openbijli/#/sakshi).

**It never opens, wires into or alters the meter.** Read
[docs/safety-and-legal.md](docs/safety-and-legal.md) before installing.

## What it can and cannot show

| Can show | Cannot show |
|---|---|
| Billed units exceed what the meter itself registered (reading or billing errors) | That the meter's measurement is accurate (only indicated by the home tests) |
| Prepaid deductions out of line with the tariff for your consumption | Consumption during minutes the device was unplugged |
| How long supply took to return after a recharge | Anything about the meter's internals or communications |
| The meter advancing with your main switch off (creep or a load before your switch) | |

## Parts

| Part | Notes |
|---|---|
| ESP32 DevKit (30-pin, ESP32-WROOM-32) | Any board with GPIO 27 and 34 free |
| Optical sensor: LM393 **photodiode** comparator module | Get the photodiode version, not the LDR one (LDRs are too slow for 15-50 ms LED pulses). Alternative: TSLR257 (red-filtered light-to-voltage) into a comparator |
| 18650 cell + UPS/charger board with 5 V boost | Keeps the device running through outages so it can log them |
| 5 V USB adapter on a household socket | Its presence is what "supply on" means |
| 2 x 100 kΩ resistors | Divider from the adapter's 5 V to GPIO 34 (supply sense) |
| Optional DS3231 RTC module | Keeps time without Wi-Fi; enable `SAKSHI_USE_DS3231` |
| Black EVA foam (1-2 mm), hook-and-loop strap or removable adhesive pad | Light seal and mounting |
| 3D-printed parts | [enclosure/sensor-clip.scad](enclosure/sensor-clip.scad), [enclosure/electronics-box.scad](enclosure/electronics-box.scad) |

## Wiring

Everything below is on the consumer's side of the wall. Nothing connects to the meter.

```
 household socket ── 5 V USB adapter ──┬──> UPS board IN ── UPS 5 V OUT ──> ESP32 VIN / GND
                                       │
                                       └─ 100k ─┬─ 100k ─ GND
                                                └──────────> GPIO34  (HIGH = supply on)

 optical sensor (in the clip, over the meter's kWh LED)
     VCC ──> 3V3      GND ──> GND      DO ──> GPIO27  (LOW on light; set in Setup)

 DS3231 (optional)    SDA ──> GPIO21   SCL ──> GPIO22   VCC ──> 3V3   GND ──> GND
```

Use the board's 3V3 for the sensor so its output never exceeds the ESP32's input rating.

## Build and flash

```bash
cd firmware
pio test -e native            # SHA-256, record format and pulse filter (cross-checked with the TypeScript engine)
pio run -e esp32dev -t upload
pio device monitor            # shows the setup access point name and password
```

No PlatformIO? The [ESPHome variant](esphome/meter-sakshi.yaml) gives live power and energy in
Home Assistant with the same hardware, but no evidence log.

## Install

1. **Find the kWh LED.** Smart meters have several LEDs (kWh, kVArh, network, credit or tamper).
   The kWh test LED is usually labelled "imp/kWh" or "kWh" with the constant beside it, often red.
2. **Read the meter constant** from the nameplate (for example 3200 imp/kWh). Indian meters
   differ (Secure's single-phase meters come in 6400, 3200 and 1280 versions, and utility specs
   leave it to the manufacturer), so never assume it.
3. **Print the clip** with `led_x`/`led_y` set from your measurements, and keep `cup_outer_d`
   smaller than twice the distance to the nearest other LED. Fit the foam gasket.
4. **Mount it** on the meter's outer transparent cover with a strap around the meter body or a
   removable adhesive pad. Do not cover the display, seals, terminal cover or optical port. Do not
   drill, open or stick anything inside the meter box if it is sealed.
5. **Mount the box** on the wall beside the meter and run the sensor lead to it.
6. **Join the setup Wi-Fi** (`MeterSakshi-XXXXXX`). Its password is random, generated on first
   boot and printed on the serial console: write it on the device label. Open `http://192.168.4.1/setup`,
   enter the meter constant and your home Wi-Fi, and choose a PIN of 6-12 digits (required; every
   page and export asks for it). Forgot the PIN? Hold the BOOT button for 5 seconds while powering
   on; this clears the PIN and keeps the logs.
7. **Check the count.** With a known load running, the status page's watts should match within a
   few percent. The status LED blinks with every accepted pulse.

## Using it

- **Export** the log from the status page (last 31 days by default). Scripts can call
  `/api/log?from=YYYYMMDD&to=YYYYMMDD` with the PIN in an `X-Sakshi-Pin` header.
- **Share each day's digest** (status page or `/api/digests`) with someone you trust. It proves the
  log existed in that form on that day; without shared digests a log could be fabricated later.

### Device security

The web interface requires the PIN for every data and settings request, sent only in a header;
five wrong PINs lock it for five minutes. It refuses requests that do not name the device as
their host (DNS rebinding) and browser POSTs from other sites, and its pages cannot be framed.
The PIN is stored salted and hashed. The clock is distrusted if it jumps more than a day away from
the device's own uptime, so a spoofed time server cannot push records into the future.
- **No-load test:** start it, then switch OFF your main switch (after the meter) for 20 minutes.
- **Reference-load test:** switch everything off except one appliance measured with a plug-in
  energy meter (a 1-2 kW heater is ideal), then start the test.
- **Build the report** in the web app (*Dispute a bill*) or with
  `meter-sakshi report --log log.csv --case case.json`.

## Files

| Path | What |
|---|---|
| `firmware/` | PlatformIO project: `lib/sakshi_core` (portable, unit-tested), `src/` (ESP32 app) |
| `esphome/meter-sakshi.yaml` | Home Assistant variant |
| `enclosure/` | Parametric OpenSCAD sources for the clip, cap and box |
| `samples/` | A 3-day demo log and case file (regenerate with `npm run sample:log`) |
| `docs/log-format.md` | The log and hash-chain specification |
| `docs/safety-and-legal.md` | Rules for installation, and what is out of scope |

## Licence

Hardware designs (enclosure, wiring and assembly documentation): CERN-OHL-P-2.0, see
[hardware/LICENSE.md](../LICENSE.md). Firmware and the ESPHome configuration: MIT, see the
repository [LICENSE](../../LICENSE).
