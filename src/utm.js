"use strict";
// WGS84 UTM forward/inverse (Snyder, USGS PP 1395) and MGRS labels. Grid cells are squares in UTM metres.
const UTM = (() => {
  const a = 6378137, f = 1/298.257223563, k0 = 0.9996;
  const e2 = f*(2-f), ep2 = e2/(1-e2), e4 = e2*e2, e6 = e4*e2;
  const e1 = (1-Math.sqrt(1-e2))/(1+Math.sqrt(1-e2));
  const rad = Math.PI/180;
  const lon0 = zone => ((zone-1)*6 - 180 + 3) * rad;

  function forward(lat, lon, zone){
    const phi = lat*rad, s = Math.sin(phi), c = Math.cos(phi), t = Math.tan(phi);
    const N = a/Math.sqrt(1-e2*s*s), T = t*t, C = ep2*c*c, A = c*(lon*rad - lon0(zone));
    const M = a*((1-e2/4-3*e4/64-5*e6/256)*phi - (3*e2/8+3*e4/32+45*e6/1024)*Math.sin(2*phi)
      + (15*e4/256+45*e6/1024)*Math.sin(4*phi) - (35*e6/3072)*Math.sin(6*phi));
    const x = k0*N*(A + (1-T+C)*A**3/6 + (5-18*T+T*T+72*C-58*ep2)*A**5/120) + 500000;
    const y = k0*(M + N*t*(A*A/2 + (5-T+9*C+4*C*C)*A**4/24 + (61-58*T+T*T+600*C-330*ep2)*A**6/720));
    return {e:x, n:y};
  }
  function inverse(e, n, zone){
    const mu = (n/k0)/(a*(1-e2/4-3*e4/64-5*e6/256));
    const p1 = mu + (3*e1/2-27*e1**3/32)*Math.sin(2*mu) + (21*e1*e1/16-55*e1**4/32)*Math.sin(4*mu)
      + (151*e1**3/96)*Math.sin(6*mu) + (1097*e1**4/512)*Math.sin(8*mu);
    const s = Math.sin(p1), c = Math.cos(p1), t = Math.tan(p1);
    const N1 = a/Math.sqrt(1-e2*s*s), T1 = t*t, C1 = ep2*c*c, R1 = a*(1-e2)/(1-e2*s*s)**1.5;
    const D = (e-500000)/(N1*k0);
    const lat = p1 - (N1*t/R1)*(D*D/2 - (5+3*T1+10*C1-4*C1*C1-9*ep2)*D**4/24
      + (61+90*T1+298*C1+45*T1*T1-252*ep2-3*C1*C1)*D**6/720);
    const lon = lon0(zone) + (D - (1+2*T1+C1)*D**3/6 + (5-2*C1+28*T1-3*C1*C1+8*ep2+24*T1*T1)*D**5/120)/c;
    return {lat:lat/rad, lng:lon/rad};
  }
  const BANDS = "CDEFGHJKLMNPQRSTUVWX", ROWS = "ABCDEFGHJKLMNPQRSTUV", COLS = ["ABCDEFGH","JKLMNPQR","STUVWXYZ"];
  // digits: 5 = 1 m, 4 = 10 m, 3 = 100 m, 2 = 1 km, 1 = 10 km
  function mgrs(e, n, zone, lat, digits){
    const set = zone % 6 || 6;
    const col = COLS[(set-1)%3][Math.floor(e/100000)-1] || "?";
    const row = ROWS[(Math.floor(n/100000) + (set%2===0 ? 5 : 0)) % 20];
    const band = BANDS[Math.max(0, Math.min(19, Math.floor((lat+80)/8)))];
    const d = Math.max(0, Math.min(5, digits)), div = 10**(5-d);
    const ee = String(Math.floor((e % 100000)/div)).padStart(d,"0"), nn = String(Math.floor((n % 100000)/div)).padStart(d,"0");
    return d ? `${zone}${band} ${col}${row} ${ee} ${nn}` : `${zone}${band} ${col}${row}`;
  }
  return {forward, inverse, mgrs};
})();
if (typeof module !== "undefined") module.exports = UTM;
