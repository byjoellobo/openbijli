// Meter Sakshi sensor clip (OpenSCAD, parametric). Units: mm.
//
// A light-tight cup holds the optical sensor over the meter's kWh pulse LED. It sits on
// the meter's OUTER transparent cover and is held by a strap or removable adhesive pad.
// It never covers the display, seals, terminal cover, optical port or other LEDs, and
// nothing passes into the meter.
//
// Measure your meter: the LED position from the left and bottom edges of the flat area
// where the plate will rest, and the LED-to-nearest-other-LED spacing (keep the cup's
// outer radius below that spacing so a red credit/tamper LED is not counted).
//
// Render:  openscad -o sensor-clip.stl -D part=\"clip\" sensor-clip.scad
//          openscad -o sensor-cap.stl  -D part=\"cap\"  sensor-clip.scad

part = "assembly";        // "clip", "cap" or "assembly"

/* [Plate] */
plate_w = 46;             // width of the plate resting on the meter cover
plate_h = 34;             // height
plate_t = 2.4;            // thickness
corner_r = 4;
led_x = 23;               // LED centre from the plate's left edge
led_y = 17;               // LED centre from the plate's bottom edge

/* [Optical cup] */
sensor_d = 5.4;           // bore for a 5 mm photodiode (TSLR257 / LM393 module diode: measure yours)
cup_outer_d = 12;         // keep < 2 x distance to the nearest other LED
cup_depth = 9;            // shroud length: deeper = less ambient light
gasket_d = 10;            // foam gasket ring outer diameter (black EVA, 1-2 mm)
gasket_recess = 1.2;      // recess depth in the plate face for the gasket
aperture_d = 3.0;         // window over the LED; small rejects neighbouring LEDs

/* [Mounting] */
strap_w = 20;             // slots for a hook-and-loop or elastic strap around the meter body
strap_slot_t = 3;
cable_d = 4.5;            // cable exit for the sensor lead

$fn = 72;

module rounded_rect(w, h, r, t) {
  hull() for (x = [r, w - r], y = [r, h - r]) translate([x, y, 0]) cylinder(r = r, h = t);
}

module plate() {
  difference() {
    rounded_rect(plate_w, plate_h, corner_r, plate_t);
    // gasket recess on the meter-facing side (z = 0)
    translate([led_x, led_y, -0.01]) difference() {
      cylinder(d = gasket_d, h = gasket_recess);
      cylinder(d = aperture_d + 2, h = gasket_recess);
    }
    // optical aperture
    translate([led_x, led_y, -0.01]) cylinder(d = aperture_d, h = plate_t + 0.02);
    // strap slots at both ends
    for (x = [3, plate_w - 3 - strap_slot_t])
      translate([x, (plate_h - strap_w) / 2, -0.01]) cube([strap_slot_t, strap_w, plate_t + 0.02]);
  }
}

module cup() {
  translate([led_x, led_y, plate_t]) difference() {
    cylinder(d = cup_outer_d, h = cup_depth);
    translate([0, 0, -0.01]) cylinder(d = sensor_d, h = cup_depth + 0.02);
    // cable exit, sideways, near the top
    translate([0, 0, cup_depth - cable_d / 2 - 1]) rotate([0, 90, 0]) cylinder(d = cable_d, h = cup_outer_d);
  }
}

// Push-fit cap that keeps the sensor seated and blocks light from behind.
module cap() {
  difference() {
    union() {
      cylinder(d = cup_outer_d + 3.2, h = 2);
      translate([0, 0, 2]) cylinder(d = sensor_d - 0.2, h = 3);
    }
    translate([0, 0, -0.01]) cylinder(d = 1.6, h = 5.02);  // pin relief for leads
  }
}

module clip() {
  plate();
  cup();
}

if (part == "clip") clip();
else if (part == "cap") cap();
else {
  color("dimgray") clip();
  color("black") translate([led_x, led_y, plate_t + cup_depth + 6]) rotate([180, 0, 0]) cap();
}
