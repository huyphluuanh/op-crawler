// Nhận diện dòng điện thoại trong văn bản tiếng Việt (bài viết / bình luận fanpage in ốp).
// Thuần TypeScript, không phụ thuộc gì → chạy được cả trên Deno (Edge Function) lẫn Node (test).
//
// Cách làm: chuẩn hóa văn bản (bỏ dấu, chữ thường, tách chữ/số: "ip15prm" → "ip 15 prm"),
// rồi chạy lần lượt các luật theo thứ tự ưu tiên. Mỗi đoạn đã khớp bị "xóa" để luật sau không
// khớp lại. Luật có tên hãng đi trước, luật "trơn" (vd "15 pro max" không ghi "ip") chạy cuối.

export interface PhoneMention {
  brand: string;
  model: string;
  /** Đoạn văn bản (đã chuẩn hóa) khớp luật — để kiểm tra lại khi cần. */
  matched: string;
}

export const UNKNOWN_BRAND = 'Chưa rõ hãng';

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\+/g, ' plus ')
    .replace(/[\/,&;|]/g, ' / ')
    .replace(/[^a-z0-9\/]+/g, ' ')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

type Rule = {
  re: RegExp;
  build: (m: RegExpExecArray) => Omit<PhoneMention, 'matched'> | null;
  /** Bắt tiếp các model liệt kê sau model đầu, vd "ip 13 / 14 / 15 pro max". */
  more?: { re: RegExp; build: (m: RegExpExecArray) => Omit<PhoneMention, 'matched'> | null };
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const SEP = String.raw`\s*(?:\/|\bva\b|\bhoac\b|\bvoi\b)\s*`;

// ---------- Apple ----------
const IP_PREFIX = String.raw`\b(?:iphone|iphon|ifone|ipone|iph|ip|i phone|ai phone|aiphone|apple)`;
const IP_VARIANT = String.raw`(pro max|promax|pro m|prm|pm|pro|plus|p|mini|max|air|s plus|s|e|c)?`;
const IP_NUMBERED = String.raw`(\d{1,2}) ?${IP_VARIANT}`;
const IP_LETTER = String.raw`(x s max|xs max|xsmax|xsm|xs|xr|x|se(?: \d{1,4})?|air)`;

function iphoneNumbered(numStr: string, variant: string | undefined) {
  const n = parseInt(numStr, 10);
  if (n < 4 || n > 17) return null;
  let v = variant ?? '';
  // "e" (em), "c" (chị) hay đứng sau số trong câu chat → chỉ nhận khi đúng là model có thật.
  if ((v === 'e' && n !== 16) || (v === 'c' && n !== 5) || (v === 's' && n > 6) || (v === 'mini' && n !== 12 && n !== 13)) v = '';
  if (v === 'air') return { brand: 'Apple', model: 'iPhone Air' };
  const suffix: Record<string, string> = {
    'pro max': ' Pro Max', promax: ' Pro Max', 'pro m': ' Pro Max', prm: ' Pro Max', pm: ' Pro Max',
    max: n >= 11 ? ' Pro Max' : ' Max', pro: ' Pro', plus: ' Plus', p: ' Plus', mini: ' mini',
    's plus': 's Plus', s: 's', e: 'e', c: 'c', '': '',
  };
  return { brand: 'Apple', model: `iPhone ${n}${suffix[v] ?? ''}` };
}

function iphoneLetter(code: string) {
  if (code.startsWith('se')) return { brand: 'Apple', model: 'iPhone SE' };
  const map: Record<string, string> = {
    'x s max': 'XS Max', 'xs max': 'XS Max', xsmax: 'XS Max', xsm: 'XS Max', xs: 'XS', xr: 'XR', x: 'X', air: 'Air',
  };
  return { brand: 'Apple', model: `iPhone ${map[code]}` };
}

// ---------- Samsung ----------
const SS_PREFIX = String.raw`\b(?:samsung|sam sung|samsum|ss|galaxy)(?: galaxy)?`;
const SS_S = String.raw`s ?(\d{1,2}) ?(ultra|u|plus|p|fe|edge|e)?`;
function samsungS(numStr: string, v?: string) {
  const n = parseInt(numStr, 10);
  if (n < 2 || n > 30) return null;
  if (v === 'e' && n !== 10) v = undefined;
  const suffix: Record<string, string> = { ultra: ' Ultra', u: ' Ultra', plus: '+', p: '+', fe: ' FE', edge: ' Edge', e: 'e' };
  return { brand: 'Samsung', model: `Galaxy S${n}${v ? suffix[v] : ''}` };
}

// ---------- Rules (thứ tự quan trọng) ----------
const R = (s: string) => new RegExp(s, 'g');

const RULES: Rule[] = [
  // iPhone có tiền tố: "ip 15 prm", "iphone 13 / 14 / 15 pro max", "ip xs max", "iphone se 2022"
  {
    re: R(`${IP_PREFIX} (?:${IP_LETTER}|${IP_NUMBERED})\\b`),
    build: (m) => (m[1] ? iphoneLetter(m[1]) : iphoneNumbered(m[2], m[3])),
    more: {
      re: new RegExp(`${SEP}(?:${IP_LETTER}|${IP_NUMBERED})\\b`, 'y'),
      build: (m) => (m[1] ? iphoneLetter(m[1]) : iphoneNumbered(m[2], m[3])),
    },
  },
  // Samsung có tiền tố
  {
    re: R(`${SS_PREFIX} (?:${SS_S}|a ?(\\d{2,3}) ?(s|e)?|(m|f) ?(\\d{2}) ?(s)?|note ?(\\d{1,2}) ?(ultra|plus|lite|pro)?|z? ?(flip|fold) ?(\\d)?)\\b`),
    build: (m) => {
      if (m[1]) return samsungS(m[1], m[2]);
      if (m[3]) return { brand: 'Samsung', model: `Galaxy A${m[3]}${m[4] ?? ''}` };
      if (m[5]) return { brand: 'Samsung', model: `Galaxy ${m[5].toUpperCase()}${m[6]}${m[7] ?? ''}` };
      if (m[8]) return { brand: 'Samsung', model: `Galaxy Note ${parseInt(m[8], 10)}${m[9] ? ' ' + cap(m[9]) : ''}` };
      if (m[10]) return { brand: 'Samsung', model: `Galaxy Z ${cap(m[10])}${m[11] ?? ''}` };
      return null;
    },
    more: {
      re: new RegExp(`${SEP}(?:${SS_S}|a ?(\\d{2,3}) ?(s|e)?)\\b`, 'y'),
      build: (m) => (m[1] ? samsungS(m[1], m[2]) : { brand: 'Samsung', model: `Galaxy A${m[3]}${m[4] ?? ''}` }),
    },
  },
  // Xiaomi / Redmi / POCO
  {
    re: R(String.raw`\bredmi note ?(\d{1,2}) ?(pro plus|pro|s|t|e)?\b`),
    build: (m) => ({ brand: 'Xiaomi', model: `Redmi Note ${parseInt(m[1], 10)}${m[2] ? ' ' + fmtVariant(m[2]) : ''}` }),
  },
  {
    re: R(String.raw`\bredmi (?:(a|k) ?(\d{1,2}) ?(pro|s|c)?|(\d{1,2}) ?(c|a|t|s)?)\b`),
    build: (m) => m[1]
      ? { brand: 'Xiaomi', model: `Redmi ${m[1].toUpperCase()}${parseInt(m[2], 10)}${m[3] ? ' ' + fmtVariant(m[3]) : ''}` }
      : { brand: 'Xiaomi', model: `Redmi ${parseInt(m[4], 10)}${(m[5] ?? '').toUpperCase()}` },
  },
  {
    re: R(String.raw`\bpoco (x|f|m|c) ?(\d{1,2}) ?(pro|gt|ultra)?\b`),
    build: (m) => ({ brand: 'Xiaomi', model: `POCO ${m[1].toUpperCase()}${parseInt(m[2], 10)}${m[3] ? ' ' + fmtVariant(m[3]) : ''}` }),
  },
  {
    re: R(String.raw`\b(?:xiaomi|xiomi|xiaome|mi) ?(\d{1,2}) ?(t pro|ultra|pro|lite|t|s)?\b`),
    build: (m) => {
      const n = parseInt(m[1], 10);
      if (n < 5 || n > 20) return null;
      return { brand: 'Xiaomi', model: `Xiaomi ${n}${m[2] ? (m[2].startsWith('t') ? m[2].replace('t', 'T').replace(' pro', ' Pro') : ' ' + fmtVariant(m[2])) : ''}` };
    },
  },
  // OPPO
  {
    re: R(String.raw`\b(?:oppo )?reno ?(\d{1,2}) ?(pro plus|pro|f|z|t)?\b`),
    build: (m) => ({ brand: 'OPPO', model: `OPPO Reno${parseInt(m[1], 10)}${m[2] ? ' ' + fmtVariant(m[2]) : ''}` }),
  },
  {
    re: R(String.raw`\b(?:oppo )?find (x|n) ?(\d) ?(pro|ultra|flip)?\b`),
    build: (m) => ({ brand: 'OPPO', model: `OPPO Find ${m[1].toUpperCase()}${m[2]}${m[3] ? ' ' + cap(m[3]) : ''}` }),
  },
  {
    re: R(String.raw`\boppo (a|f|k) ?(\d{1,3}) ?(s|k|x|e|pro)?\b`),
    build: (m) => ({ brand: 'OPPO', model: `OPPO ${m[1].toUpperCase()}${m[2]}${m[3] ? fmtSuffix(m[3]) : ''}` }),
  },
  // vivo
  {
    re: R(String.raw`\bvivo (y|v|x|t|s) ?(\d{1,3}) ?(pro|plus|lite|e|s|c|t)?\b`),
    build: (m) => ({ brand: 'vivo', model: `vivo ${m[1].toUpperCase()}${m[2]}${m[3] ? fmtSuffix(m[3]) : ''}` }),
  },
  // realme
  {
    re: R(String.raw`\brealme (?:(c|gt|narzo|note) ?)?(\d{1,2}) ?(pro plus|pro|i|t|s)?\b`),
    build: (m) => ({ brand: 'realme', model: `realme ${m[1] ? m[1].toUpperCase() : ''}${parseInt(m[2], 10)}${m[3] ? (m[3].startsWith('pro') ? ' ' + fmtVariant(m[3]) : m[3]) : ''}` }),
  },
  // Huawei, Honor, Google, Nokia
  {
    re: R(String.raw`\bhuawei (p|mate|nova|y) ?(\d{1,2}) ?(pro|lite|plus|i)?\b`),
    build: (m) => ({ brand: 'Huawei', model: `Huawei ${m[1].length > 1 ? cap(m[1]) + ' ' : m[1].toUpperCase()}${m[2]}${m[3] ? ' ' + fmtVariant(m[3]) : ''}` }),
  },
  {
    re: R(String.raw`\bhonor (?:(x|magic) ?)?(\d{1,3}) ?(pro|lite|plus)?\b`),
    build: (m) => ({ brand: 'Honor', model: `Honor ${m[1] ? (m[1] === 'x' ? 'X' : 'Magic ') : ''}${m[2]}${m[3] ? ' ' + fmtVariant(m[3]) : ''}` }),
  },
  {
    re: R(String.raw`\b(?:google )?pixel ?(\d{1,2}) ?(pro xl|pro fold|pro|xl|a)?\b`),
    build: (m) => ({ brand: 'Google', model: `Pixel ${m[1]}${m[2] ? (m[2] === 'a' ? 'a' : ' ' + m[2].split(' ').map(cap).join(' ').replace('Xl', 'XL')) : ''}` }),
  },
  {
    re: R(String.raw`\bnokia (\d{1,4}|c ?\d{1,2}|g ?\d{1,2})\b`),
    build: (m) => ({ brand: 'Nokia', model: `Nokia ${m[1].replace(' ', '').toUpperCase()}` }),
  },

  // ----- Luật "trơn" (không ghi tên hãng) — chạy sau cùng -----
  // "s23 ultra", "s24u", "z flip 5", "fold 6" → Samsung
  {
    re: R(String.raw`\bs ?(2[0-6]|1[0-9]|[89]) ?(ultra|u|plus|fe)?\b|\bz ?(flip|fold) ?(\d)\b|\b(flip|fold) ?([3-7])\b`),
    build: (m) => {
      if (m[1]) return samsungS(m[1], m[2]);
      const kind = m[3] ?? m[5];
      return { brand: 'Samsung', model: `Galaxy Z ${cap(kind)}${m[4] ?? m[6]}` };
    },
  },
  // "note 20 ultra" → Samsung; "note 13 pro" → Redmi Note (Samsung không có Note 11–15)
  {
    re: R(String.raw`\bnote ?(\d{1,2}) ?(ultra|plus|lite|pro plus|pro|s)?\b`),
    build: (m) => {
      const n = parseInt(m[1], 10);
      if ([8, 9, 10, 20].includes(n) && (!m[2] || ['ultra', 'plus', 'lite'].includes(m[2]))) {
        return { brand: 'Samsung', model: `Galaxy Note ${n}${m[2] ? ' ' + cap(m[2]) : ''}` };
      }
      if (n >= 7 && n <= 15) return { brand: 'Xiaomi', model: `Redmi Note ${n}${m[2] ? ' ' + fmtVariant(m[2]) : ''}` };
      return null;
    },
  },
  // "15 pro max", "14prm", "13 pro", "7 plus" → iPhone (khách in ốp thường viết tắt kiểu này).
  // Chạy sau luật "note"/Samsung để "note 13 pro", "s23 plus" không bị nhận nhầm.
  {
    re: R(String.raw`\b(1[1-7]) ?(pro max|promax|pro m|prm|pm|pro|plus|mini)\b|\b([678]) ?(s plus|plus)\b|\b(xs max|xsmax|xr)\b`),
    build: (m) => (m[5] ? iphoneLetter(m[5]) : m[1] ? iphoneNumbered(m[1], m[2]) : iphoneNumbered(m[3], m[4])),
  },
  // "a54", "a05s" không ghi hãng: Samsung và OPPO đều có dòng A trùng tên → để "Chưa rõ hãng".
  // Loại "a 50k", "a 30 cai"... (tiền, số lượng).
  {
    re: R(String.raw`\ba ?(\d{2}) ?(s)?\b(?! ?(?:k|d|dong|tr|trieu|nghin|ngan|cai|chiec|ngay|h|p|phut|tuoi)\b)`),
    build: (m) => ({ brand: UNKNOWN_BRAND, model: `Dòng A${m[1]}${m[2] ?? ''} (Samsung/OPPO?)` }),
  },
];

function fmtVariant(v: string): string {
  if (v === 'pro plus') return 'Pro+';
  if (v.length <= 1) return v.toUpperCase();
  return cap(v);
}
function fmtSuffix(v: string): string {
  return v.length <= 1 ? v : ' ' + cap(v);
}

/** Trích các dòng máy được nhắc tới trong văn bản (mỗi model tối đa 1 lần). */
export function extractPhoneModels(text: string | null | undefined): PhoneMention[] {
  if (!text) return [];
  let s = ` ${normalize(text)} `;
  const found = new Map<string, PhoneMention>();
  const add = (r: Omit<PhoneMention, 'matched'> | null, matched: string) => {
    if (r && !found.has(r.model)) found.set(r.model, { ...r, matched: matched.trim() });
  };

  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    const spans: Array<[number, number]> = [];
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(s))) {
      let end = m.index + m[0].length;
      add(rule.build(m), m[0]);
      if (rule.more) {
        rule.more.re.lastIndex = end;
        let mm: RegExpExecArray | null;
        while ((mm = rule.more.re.exec(s)) && mm[0].trim() !== '') {
          add(rule.more.build(mm), mm[0]);
          end = rule.more.re.lastIndex;
        }
      }
      spans.push([m.index, end]);
      rule.re.lastIndex = end;
    }
    // Xóa đoạn đã khớp để luật sau không khớp lại (giữ độ dài chuỗi để vị trí không lệch).
    for (const [a, b] of spans) s = s.slice(0, a) + ' # '.padEnd(b - a, ' ').slice(0, b - a) + s.slice(b);
  }
  return [...found.values()];
}
