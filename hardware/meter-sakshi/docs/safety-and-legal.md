# Safety and legal boundaries

Meter Sakshi exists to help consumers check their bills without giving anyone reason to accuse
them of tampering. These rules are part of the design, not suggestions.

## The rules

1. **Never open, drill, unseal or alter the meter, its box seals, terminal cover or wiring.**
   Electricity meters and their seals belong to the distribution licensee; interfering with them
   can be an offence under the Electricity Act, 2003, and is dangerous.
2. **No electrical connection to the meter.** The only connections are to the device's own USB
   supply, plugged into an ordinary socket in the home. The sensor touches only the outside of the
   meter's transparent cover.
3. **Do not block anything the utility needs.** Keep the display, seals, terminal cover, optical
   port and other LEDs uncovered. The clip must come off in seconds, leaving no residue.
4. **Do not work inside a meter box or distribution board.** If the meter is inside a sealed or
   locked box, mount the clip only where it is reachable without opening anything, or do not
   install it. Never touch live parts.
5. **Remove it on request** by the utility's staff, and tell them what it is: an optical reader of
   the test LED that records the meter's own pulses.
6. **The home tests are switched on your side only.** The no-load test means switching off your
   own main switch, after the meter.

## What the device does not do

- It does not read or write the meter's optical (DLMS/IEC 62056-21) port. Reading that port might
  give more data, but whether consumers may do so is unverified, and some libraries for it also
  expose commands such as relay disconnection. A future "optical port mode" would have to be
  read-only and legally cleared first. The WebAssembly DLMS library published in April 2026
  (`@bubblyworld/gurux-dlms-ts`) is GPL-2.0 and is deliberately not bundled with this MIT project.
- It does not measure voltage or current, and it does not claim to be a certified meter.

## How to present the evidence

- The report states that the readings come from the meter's own LED, how integrity is checked,
  and what the device cannot show.
- Ask for the remedies the rules already give you: meter testing within 30 days of a complaint,
  a check meter within five days for at least three months when readings are not commensurate with
  consumption, a third-party laboratory of your choice if you dispute the result, and the CGRF and
  Ombudsman (Electricity (Rights of Consumers) Rules rules 5(7) and 5(11); Electricity Act 2003
  section 42(5)-(6)). The report lists these with sources from the dataset.

## Electrical safety

- Use a certified 5 V adapter and a protected 18650 cell with a proper charge board.
- Keep the electronics box off the meter and away from water.
- This project gives no warranty; you install it at your own risk.
