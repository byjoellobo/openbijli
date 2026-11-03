// Meter Sakshi electronics box: ESP32 DevKit, 18650 UPS module and screw terminals.
// Mounts on the wall NEXT TO the meter box (never inside a sealed meter enclosure).
// Units: mm. Render: openscad -o box.stl -D part=\"box\" electronics-box.scad

part = "box";             // "box" or "lid"

inner_w = 92;             // fits a 30-pin ESP32 DevKit (~55 x 28) beside an 18650 UPS board
inner_d = 62;
inner_h = 30;
wall = 2;
floor_t = 2;
corner_r = 3;
usb_w = 12;               // USB inlet for the household 5 V adapter
usb_h = 7;
cable_d = 5;              // sensor cable from the clip
screw_d = 3.4;            // wall-mount screw holes
vent_w = 1.6;

$fn = 48;

module rounded_box(w, d, h, r) {
  hull() for (x = [r, w - r], y = [r, d - r]) translate([x, y, 0]) cylinder(r = r, h = h);
}

module box() {
  w = inner_w + 2 * wall;
  d = inner_d + 2 * wall;
  difference() {
    rounded_box(w, d, inner_h + floor_t, corner_r);
    translate([wall, wall, floor_t]) rounded_box(inner_w, inner_d, inner_h + 1, max(corner_r - wall, 0.5));
    // USB inlet (left wall)
    translate([-0.01, d / 2 - usb_w / 2, floor_t + 4]) cube([wall + 0.02, usb_w, usb_h]);
    // sensor cable (right wall)
    translate([w - wall - 0.01, d / 2, floor_t + 8]) rotate([0, 90, 0]) cylinder(d = cable_d, h = wall + 0.02);
    // wall-mount holes
    for (x = [12, w - 12]) translate([x, d / 2, -0.01]) cylinder(d = screw_d, h = floor_t + 0.02);
    // vents for the charger
    for (i = [0:5]) translate([20 + i * 4, -0.01, floor_t + inner_h - 10]) cube([vent_w, wall + 0.02, 6]);
  }
}

module lid() {
  w = inner_w + 2 * wall;
  d = inner_d + 2 * wall;
  rounded_box(w, d, 2, corner_r);
  translate([wall + 0.3, wall + 0.3, 2]) difference() {
    rounded_box(inner_w - 0.6, inner_d - 0.6, 3, max(corner_r - wall, 0.5));
    translate([1.2, 1.2, -0.01]) rounded_box(inner_w - 3, inner_d - 3, 3.02, 0.5);
  }
}

if (part == "lid") lid(); else box();
