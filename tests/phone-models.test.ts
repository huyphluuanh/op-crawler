import { describe, expect, it } from 'vitest';
import { extractPhoneModels, normalize, UNKNOWN_BRAND } from '../supabase/functions/_shared/phone-models.ts';

const models = (t: string | null) => extractPhoneModels(t).map((m) => m.model).sort();

describe('normalize', () => {
  it('bỏ dấu, tách chữ/số, đổi + thành plus', () => {
    expect(normalize('Ốp IP15PRM đẹp quá!!')).toBe('op ip 15 prm dep qua');
    expect(normalize('Reno10 Pro+')).toBe('reno 10 pro plus');
    expect(normalize('ip 13/14, 15')).toBe('ip 13 / 14 / 15');
  });
});

describe('iPhone', () => {
  it.each([
    ['in cho mình ip 15 prm nhé shop', 'iPhone 15 Pro Max'],
    ['Iphone 14 Pro Max', 'iPhone 14 Pro Max'],
    ['ip14pm', 'iPhone 14 Pro Max'],
    ['ip 13 promax', 'iPhone 13 Pro Max'],
    ['máy e 15 pro max ạ', 'iPhone 15 Pro Max'],
    ['16prm còn không shop', 'iPhone 16 Pro Max'],
    ['12 pro', 'iPhone 12 Pro'],
    ['ip 11', 'iPhone 11'],
    ['iphone 7 plus', 'iPhone 7 Plus'],
    ['ip 7p', 'iPhone 7 Plus'],
    ['8 plus', 'iPhone 8 Plus'],
    ['ip xs max', 'iPhone XS Max'],
    ['xsmax', 'iPhone XS Max'],
    ['ip xr', 'iPhone XR'],
    ['ip x', 'iPhone X'],
    ['iphone se 2022', 'iPhone SE'],
    ['ip 13 mini', 'iPhone 13 mini'],
    ['ip 16e', 'iPhone 16e'],
    ['ip 17 air', 'iPhone Air'],
    ['#iphone15promax', 'iPhone 15 Pro Max'],
    ['ip 6s plus', 'iPhone 6s Plus'],
  ])('%s → %s', (text, model) => {
    expect(models(text)).toEqual([model]);
  });

  it('không lấy "e"/"c" (em/chị) làm hậu tố', () => {
    expect(models('ip 13 e nhé')).toEqual(['iPhone 13']);
    expect(models('ip 14 c ơi')).toEqual(['iPhone 14']);
  });

  it('liệt kê nhiều đời sau một tiền tố', () => {
    expect(models('có ip 13/14/15 pro max không')).toEqual(['iPhone 13', 'iPhone 14', 'iPhone 15 Pro Max']);
    expect(models('ip 12 và 13 pro')).toEqual(['iPhone 12', 'iPhone 13 Pro']);
  });

  it('không nhận giá tiền / số lượng là model', () => {
    expect(models('ip 15 pro max giá 150k')).toEqual(['iPhone 15 Pro Max']);
    expect(models('ship 2 cái 30k')).toEqual([]);
    expect(models('đẹp quá 10 điểm')).toEqual([]);
  });

  it('mỗi model chỉ đếm 1 lần trong 1 bình luận', () => {
    expect(extractPhoneModels('15 prm 15 prm ip 15 pro max')).toHaveLength(1);
  });
});

describe('Samsung', () => {
  it.each([
    ['ss s23 ultra', 'Galaxy S23 Ultra'],
    ['s24u', 'Galaxy S24 Ultra'],
    ['samsung galaxy s24+', 'Galaxy S24+'],
    ['Samsung A54', 'Galaxy A54'],
    ['ss a05s', 'Galaxy A05s'],
    ['note 20 ultra', 'Galaxy Note 20 Ultra'],
    ['z flip 5', 'Galaxy Z Flip5'],
    ['samsung fold6', 'Galaxy Z Fold6'],
    ['s21 fe', 'Galaxy S21 FE'],
  ])('%s → %s', (text, model) => {
    expect(models(text)).toEqual([model]);
  });

  it('liệt kê', () => {
    expect(models('ss s22/s23 ultra')).toEqual(['Galaxy S22', 'Galaxy S23 Ultra']);
  });
});

describe('Android khác', () => {
  it.each([
    ['redmi note 13 pro', 'Redmi Note 13 Pro'],
    ['note 12', 'Redmi Note 12'],
    ['redmi 13c', 'Redmi 13C'],
    ['xiaomi 14 ultra', 'Xiaomi 14 Ultra'],
    ['xiaomi 13t pro', 'Xiaomi 13T Pro'],
    ['poco x6 pro', 'POCO X6 Pro'],
    ['oppo reno 10 pro+', 'OPPO Reno10 Pro+'],
    ['reno8t', 'OPPO Reno8 T'],
    ['oppo a57', 'OPPO A57'],
    ['oppo find x7 ultra', 'OPPO Find X7 Ultra'],
    ['vivo y17s', 'vivo Y17s'],
    ['vivo v29e', 'vivo V29e'],
    ['realme c55', 'realme C55'],
    ['huawei p30 pro', 'Huawei P30 Pro'],
    ['pixel 8 pro', 'Pixel 8 Pro'],
  ])('%s → %s', (text, model) => {
    expect(models(text)).toEqual([model]);
  });

  it('dòng A không ghi hãng → chưa rõ hãng', () => {
    const r = extractPhoneModels('máy a54 ạ');
    expect(r).toHaveLength(1);
    expect(r[0].brand).toBe(UNKNOWN_BRAND);
    expect(models('chị a 50k nhé')).toEqual([]);
  });
});

describe('câu thật', () => {
  it('bình luận nhiều máy, nhiều hãng', () => {
    expect(models('Shop ơi in hình này cho e 2 ốp: 1 cái ip 15 prm, 1 cái ss s24 ultra nha')).toEqual([
      'Galaxy S24 Ultra', 'iPhone 15 Pro Max',
    ]);
  });
  it('bài đăng của shop', () => {
    expect(models('✨ Ốp in hình theo yêu cầu ✨ Có đủ mã iPhone 11 → 16 Pro Max, Samsung S23, OPPO Reno 11')).toEqual([
      'Galaxy S23', 'OPPO Reno11', 'iPhone 11', 'iPhone 16 Pro Max',
    ]);
  });
  it('văn bản không có máy', () => {
    expect(models('Đẹp quá shop ơi, inbox giá nhé')).toEqual([]);
    expect(models(null)).toEqual([]);
  });
});
