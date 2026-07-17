#!/usr/bin/env python3
"""Generate the hairline Europe geometry used by the European presence map.

Emits the two SVG path strings that are pasted into index.html as EURO_COAST
and EURO_BORD, plus the Lambert conformal conic constants that project() in
index.html must use. If you change the window or the parallels, regenerate and
update BOTH the paths and the constants, or the pins will drift off the coast.

Inputs (Natural Earth 1:50m, public domain -- not committed, fetch on demand):

    curl -LO https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_coastline.geojson
    curl -LO https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_boundary_lines_land.geojson
    mv ne_50m_coastline.geojson ne_50m_coastline.json
    mv ne_50m_admin_0_boundary_lines_land.geojson ne_50m_admin_0_boundary_lines_land.json

Usage:  python3 gen_europe.py [tolerance_px] [min_path_len_px]
        python3 gen_europe.py 0.6 8.0      # settings used for the shipped map

Outputs: europe_coast.txt, europe_bord.txt, preview.svg (visual check), and the
RUNTIME CONSTS block printed at the end. verify() re-tokenizes the emitted path
exactly as an SVG parser would -- this catches separator bugs that would
silently truncate the map.

Pipeline: clip to window -> Lambert conformal conic -> fit to viewBox ->
Douglas-Peucker simplify -> relative-encoded path data (~30KB at 0.6px).
"""

import json, math

# ── projection window (lon/lat) ──────────────────────────────────────────
LON0, LON1 = -14.0, 33.0
LAT0, LAT1 = 35.5, 62.0

# ── Lambert conformal conic (Europe standard parallels) ──────────────────
LAT_1, LAT_2 = 40.0, 58.0     # standard parallels
LON_C, LAT_C = 10.5, 50.0     # central meridian / reference latitude

def _rad(d): return d * math.pi / 180.0

def _lcc_setup():
    p1, p2 = _rad(LAT_1), _rad(LAT_2)
    n = math.log(math.cos(p1) / math.cos(p2)) / math.log(
        math.tan(math.pi/4 + p2/2) / math.tan(math.pi/4 + p1/2))
    F = math.cos(p1) * math.tan(math.pi/4 + p1/2)**n / n
    rho0 = F / math.tan(math.pi/4 + _rad(LAT_C)/2)**n
    return n, F, rho0

N, F, RHO0 = _lcc_setup()

def project(lon, lat):
    rho = F / math.tan(math.pi/4 + _rad(lat)/2)**N
    th = N * _rad(lon - LON_C)
    return (rho * math.sin(th), RHO0 - rho * math.cos(th))

# ── Liang-Barsky segment clip against the lon/lat window ─────────────────
def clip_seg(p0, p1):
    x0, y0 = p0; x1, y1 = p1
    dx, dy = x1 - x0, y1 - y0
    t0, t1 = 0.0, 1.0
    for p, q in ((-dx, x0 - LON0), (dx, LON1 - x0), (-dy, y0 - LAT0), (dy, LAT1 - y0)):
        if abs(p) < 1e-12:
            if q < 0: return None
            continue
        r = q / p
        if p < 0:
            if r > t1: return None
            if r > t0: t0 = r
        else:
            if r < t0: return None
            if r < t1: t1 = r
    return ((x0 + t0*dx, y0 + t0*dy), (x0 + t1*dx, y0 + t1*dy), t0, t1)

def clip_line(coords):
    out, cur = [], []
    for i in range(len(coords) - 1):
        seg = clip_seg(coords[i], coords[i+1])
        if seg is None:
            if len(cur) > 1: out.append(cur)
            cur = []
            continue
        a, b, t0, t1 = seg
        if not cur:
            cur = [a]
        elif math.dist(cur[-1], a) > 1e-9:
            if len(cur) > 1: out.append(cur)
            cur = [a]
        cur.append(b)
        if t1 < 1 - 1e-9:
            if len(cur) > 1: out.append(cur)
            cur = []
    if len(cur) > 1: out.append(cur)
    return out

# ── Douglas-Peucker (in projected pixel space) ───────────────────────────
def rdp(pts, tol):
    if len(pts) < 3: return pts
    dmax, idx = 0.0, 0
    ax, ay = pts[0]; bx, by = pts[-1]
    ex, ey = bx - ax, by - ay
    L = math.hypot(ex, ey)
    for i in range(1, len(pts) - 1):
        px, py = pts[i]
        if L < 1e-12:
            d = math.hypot(px - ax, py - ay)
        else:
            d = abs(ey*px - ex*py + bx*ay - by*ax) / L
        if d > dmax: dmax, idx = d, i
    if dmax > tol:
        return rdp(pts[:idx+1], tol)[:-1] + rdp(pts[idx:], tol)
    return [pts[0], pts[-1]]

# ── gather + project ─────────────────────────────────────────────────────
def lines_of(path, keep=None):
    d = json.load(open(path))
    out = []
    for f in d['features']:
        if keep and not keep(f['properties']): continue
        g = f['geometry']
        parts = [g['coordinates']] if g['type'] == 'LineString' else g['coordinates']
        for part in parts:
            out.extend(clip_line([(c[0], c[1]) for c in part]))
    return out

coast = lines_of('ne_50m_coastline.json')
# borders: skip maritime-ish disputed lines, keep normal land boundaries
bord  = lines_of('ne_50m_admin_0_boundary_lines_land.json')

allpts = [p for ln in coast + bord for p in ln]
proj = {}
def P(p):
    if p not in proj: proj[p] = project(p[0], p[1])
    return proj[p]

xs = [P(p)[0] for p in allpts]; ys = [P(p)[1] for p in allpts]
minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
w, h = maxx - minx, maxy - miny
print(f"projected extent: {w:.4f} x {h:.4f}  -> natural aspect {w/h:.4f}")
print(f"viewBox 1000 wide -> height {1000*h/w:.1f}")

# ── fit to viewBox ───────────────────────────────────────────────────────
VB_W = 1000.0
VB_H = round(1000 * h / w)
PAD = 8.0
sx = (VB_W - 2*PAD) / w
sy = (VB_H - 2*PAD) / h
S = min(sx, sy)
ox = PAD + ((VB_W - 2*PAD) - w*S) / 2
oy = PAD + ((VB_H - 2*PAD) - h*S) / 2

def to_px(p):
    x, y = P(p)
    # LCC y grows north; SVG y grows south -> flip
    return (ox + (x - minx)*S, oy + (maxy - y)*S)

def num(v):
    """Shortest representation at 1dp: drop '.0', drop leading '0' in '0.x'."""
    s = f"{v:.1f}"
    if s.endswith('.0'): s = s[:-2]
    if s.startswith('0.'): s = s[1:]
    elif s.startswith('-0.'): s = '-' + s[2:]
    return s

def enc(pts):
    """Relative polyline: M<x> <y>l<dx> <dy>... — deltas are small, so this is
    far shorter than absolute coords.

    Separator rules (must match how an SVG path parser tokenizes):
      - '-' always self-delimits, so no space needed before a negative number.
      - a '.'-leading number ('.9') only self-delimits if the PREVIOUS number
        already contains a '.', because '2' + '.9' would merge into '2.9'.
    """
    out = []
    prev = ['']
    def push(tok):
        p = prev[0]
        if p and not (tok.startswith('-') or (tok.startswith('.') and '.' in p)):
            out.append(' ')
        out.append(tok)
        prev[0] = tok

    out.append('M'); prev[0] = ''
    push(num(pts[0][0])); push(num(pts[0][1]))
    out.append('l'); prev[0] = ''
    # track the position actually emitted, so 1dp rounding cannot accumulate drift
    px, py = round(pts[0][0], 1), round(pts[0][1], 1)
    for x, y in pts[1:]:
        rdx, rdy = round(x - px, 1), round(y - py, 1)
        push(num(rdx)); push(num(rdy))
        px, py = round(px + rdx, 1), round(py + rdy, 1)
    return ''.join(out)

def to_path(lines, tol, minlen=0.0):
    ds, kept, dropped = [], 0, 0
    for ln in lines:
        pts = [to_px(p) for p in ln]
        pts = rdp(pts, tol)
        if len(pts) < 2: dropped += 1; continue
        if minlen:
            L = sum(math.dist(pts[i], pts[i+1]) for i in range(len(pts)-1))
            if L < minlen: dropped += 1; continue
        kept += 1
        ds.append(enc(pts))
    return ''.join(ds), kept, dropped

for tol in (0.25, 0.4, 0.6):
    cd, ck, cdrop = to_path(coast, tol, minlen=3.0)
    bd, bk, bdrop = to_path(bord, tol, minlen=3.0)
    print(f"tol={tol}: coast {len(cd):>6}B ({ck} paths, {cdrop} dropped) | "
          f"borders {len(bd):>6}B ({bk} paths, {bdrop} dropped) | total {len(cd)+len(bd):>6}B")

import re, sys
_NUM = re.compile(r'-?(?:\d+\.\d+|\.\d+|\d+)')

def verify(d, lines, tol, minlen):
    """Re-tokenize the emitted 'd' the way an SVG parser does and confirm it
    reproduces the intended vertices. Guards the separator/rounding rules."""
    want = []
    for ln in lines:
        pts = rdp([to_px(p) for p in ln], tol)
        if len(pts) < 2: continue
        if minlen and sum(math.dist(pts[i], pts[i+1]) for i in range(len(pts)-1)) < minlen:
            continue
        want.append(pts)
    subs = [s for s in d.split('M') if s]
    assert len(subs) == len(want), f"subpath count {len(subs)} != {len(want)}"
    worst = 0.0
    for sub, w in zip(subs, want):
        head, _, rest = sub.partition('l')
        hn = _NUM.findall(head)
        rn = _NUM.findall(rest)
        assert len(hn) == 2, f"bad moveto {hn}"
        assert len(rn) % 2 == 0, f"odd number count {len(rn)} in subpath -> parser would desync"
        assert len(rn)//2 == len(w)-1, f"vertex count {len(rn)//2+1} != {len(w)}"
        x, y = float(hn[0]), float(hn[1])
        got = [(x, y)]
        for i in range(0, len(rn), 2):
            x += float(rn[i]); y += float(rn[i+1])
            got.append((round(x, 4), round(y, 4)))
        for g, ww in zip(got, w):
            worst = max(worst, math.dist(g, ww))
    return worst

TOL = float(sys.argv[1]) if len(sys.argv) > 1 else 0.4
ML  = float(sys.argv[2]) if len(sys.argv) > 2 else 3.0
cd, ck, _ = to_path(coast, TOL, minlen=ML)
bd, bk, _ = to_path(bord, TOL, minlen=ML)
ec = verify(cd, coast, TOL, ML)
eb = verify(bd, bord, TOL, ML)
print(f"VERIFY: round-trip max vertex error — coast {ec:.4f}px, borders {eb:.4f}px")
assert max(ec, eb) < 0.09, "round-trip error too large"

open('europe_coast.txt', 'w').write(cd)
open('europe_bord.txt', 'w').write(bd)
print(f"\nCHOSEN tol={TOL} minlen={ML}: coast {len(cd)}B/{ck}p + borders {len(bd)}B/{bk}p"
      f" = {len(cd)+len(bd)}B  (viewBox 0 0 {VB_W:.0f} {VB_H})")

# visual preview
open('preview.svg', 'w').write(
  f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VB_W:.0f} {VB_H}" width="{VB_W:.0f}" height="{VB_H}">'
  f'<rect width="100%" height="100%" fill="#eef3fa"/>'
  f'<path d="{bd}" fill="none" stroke="#1B3664" stroke-opacity=".22" stroke-width=".5"/>'
  f'<path d="{cd}" fill="none" stroke="#1B3664" stroke-opacity=".55" stroke-width="1.1"/>'
  + ''.join(f'<circle cx="{to_px((lo,la))[0]:.1f}" cy="{to_px((lo,la))[1]:.1f}" r="4" fill="#3a6bc8"/>'
            f'<text x="{to_px((lo,la))[0]+7:.1f}" y="{to_px((lo,la))[1]+3:.1f}" font-size="11" fill="#1B3664">{n}</text>'
            for n,lo,la in [('Milano',9.19,45.46),('Paris',2.35,48.85),('London',-0.13,51.51),
                            ('Madrid',-3.70,40.42),('Stockholm',18.07,59.33),('Brussels',4.35,50.85),
                            ('Berlin',13.40,52.52),('Prague',14.44,50.08),('Cannes',7.02,43.55),
                            ('Amsterdam',4.90,52.37)])
  + '</svg>')
print("wrote preview.svg")

# reference points so the runtime projection can be verified against this build
print("\n--- projection check (lon,lat -> px) ---")
for name, lon, lat in [('Milano',9.19,45.46),('Paris',2.35,48.85),('London',-0.13,51.51),
                       ('Madrid',-3.70,40.42),('Stockholm',18.07,59.33),('Brussels',4.35,50.85),
                       ('Berlin',13.40,52.52),('Prague',14.44,50.08),('Cannes',7.02,43.55),
                       ('Amsterdam',4.90,52.37)]:
    x, y = to_px((lon, lat))
    print(f"{name:<10} {x:7.1f} {y:7.1f}")
print(f"\nRUNTIME CONSTS: N={N!r} F={F!r} RHO0={RHO0!r}")
print(f"minx={minx!r} miny={miny!r} S={S!r} ox={ox!r} oy={oy!r}")
