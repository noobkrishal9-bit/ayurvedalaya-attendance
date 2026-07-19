// ============================================================
//  BS CALENDAR — Verified from Ayurvedalaya's official 2083 calendar
//  Baisakh 1, 2083 = April 14, 2026 (verified across all 12 months)
// ============================================================
const BS_DATA = {
  2081: [31,32,31,32,31,30,30,30,29,30,30,30],
  2082: [31,32,31,32,31,30,30,30,29,30,29,31],
  2083: [31,31,31,32,31,31,30,29,30,29,30,30],
  2084: [31,32,31,32,31,30,30,30,29,30,29,31],
  2085: [31,32,31,32,31,30,30,30,29,30,29,31],
};
const BS_MONTHS = ['Baisakh','Jestha','Asar','Shrawan','Bhadra','Ashoj',
                   'Kartik','Mangsir','Poush','Magh','Falgun','Chaitra'];
const BS_ANCHOR_AD  = new Date(2026, 3, 14); // April 14 2026
const BS_ANCHOR_BS  = { y: 2083, m: 1, d: 1 };

function adToBs(adDate) {
  const d0 = new Date(BS_ANCHOR_AD.getFullYear(), BS_ANCHOR_AD.getMonth(), BS_ANCHOR_AD.getDate());
  const d1 = new Date(adDate.getFullYear(), adDate.getMonth(), adDate.getDate());
  let diff = Math.round((d1 - d0) / 86400000);
  let { y, m, d } = { ...BS_ANCHOR_BS };

  if (diff >= 0) {
    while (diff > 0) {
      const left = bsDays(y, m) - d;
      if (diff <= left) { d += diff; diff = 0; }
      else { diff -= left + 1; d = 1; m++; if (m > 12) { m = 1; y++; } }
    }
  } else {
    let rem = -diff;
    while (rem > 0) {
      if (d > rem) { d -= rem; rem = 0; }
      else { rem -= d; m--; if (m < 1) { m = 12; y--; } d = bsDays(y, m); }
    }
  }
  return { y, m, d };
}

function bsDays(y, m) {
  return (BS_DATA[y] || Array(12).fill(30))[m - 1];
}

function formatBs(adDate, long = false) {
  const { y, m, d } = adToBs(adDate);
  return long ? `${y} ${BS_MONTHS[m-1]} ${String(d).padStart(2,'0')}`
              : `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function bsMonthName(monthNum) {
  return BS_MONTHS[monthNum - 1] || '';
}

// Get all BS months for a given year as options
function getBsMonthOptions(bsYear) {
  return BS_MONTHS.map((name, i) => ({ value: i + 1, label: `${bsYear} ${name}` }));
}

// Convert BS year+month to AD date range for querying logs
function bsMonthToAdRange(bsYear, bsMonth) {
  // Find the AD start date of this BS month
  const anchor = new Date(BS_ANCHOR_AD);
  let y = BS_ANCHOR_BS.y, m = BS_ANCHOR_BS.m;
  let dayOffset = 0;

  // Walk from anchor to target BS month
  while (y < bsYear || (y === bsYear && m < bsMonth)) {
    dayOffset += bsDays(y, m);
    m++; if (m > 12) { m = 1; y++; }
  }
  // Also walk backward if target is before anchor
  let backOffset = 0;
  let by = BS_ANCHOR_BS.y, bm = BS_ANCHOR_BS.m;
  if (bsYear < BS_ANCHOR_BS.y || (bsYear === BS_ANCHOR_BS.y && bsMonth < BS_ANCHOR_BS.m)) {
    while (by > bsYear || (by === bsYear && bm > bsMonth)) {
      bm--; if (bm < 1) { bm = 12; by--; }
      backOffset += bsDays(by, bm);
    }
    dayOffset = -backOffset;
  }

  const start = new Date(anchor);
  start.setDate(start.getDate() + dayOffset);
  const end = new Date(start);
  end.setDate(end.getDate() + bsDays(bsYear, bsMonth) - 1);
  return { start, end };
}
