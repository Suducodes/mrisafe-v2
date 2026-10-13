"""Magnet room dimensions shared by the 2x room scripts. Metres; isocentre at (0, 0, ISO)."""
X0, X1, Y0, Y1 = -2.60, 2.60, -4.40, 2.20     # finished interior faces
HC = 2.95                                    # finished (suspended) ceiling
WALL = 0.10                                  # stud + board build-up inside the cage
CAGE_OFF = WALL + 0.015                      # copper sheet sits just behind the finished wall
CAGE_TOP, CAGE_FLOOR = 3.45, -0.12
CX0, CX1, CY0, CY1 = X0 - CAGE_OFF, X1 + CAGE_OFF, Y0 - CAGE_OFF, Y1 + CAGE_OFF   # cage lines
WIN = dict(y0=-2.50, y1=-0.30, z0=0.95, z1=2.15)      # west wall, faces the table and bore
DOOR = dict(x0=-1.95, x1=-0.75, z1=2.15)              # front wall, near the control-room corner
PEN = dict(x0=0.90, x1=1.60, z0=1.10, z1=1.90)        # rear wall recess onto the cage filter panel
QX, QY = -0.16, 0.44                                  # quench stub axis (11_cover_panels_turret)
HX, HY = 0.14, 0.29                                   # cold-head helium hose bundle
CTRL_X = -6.0                                         # control room back wall
