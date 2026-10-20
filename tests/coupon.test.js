const { applyCoupon } = require('../src/utils/coupon');

describe('Coupon module', () => {
  describe('FLOWER100', () => {
    it.each([
      [800, 100],
      [1550, 100]
    ])('商品小計 %i 元折抵 %i 元', (subtotal, discount) => {
      expect(applyCoupon({ code: 'FLOWER100', subtotal })).toEqual({
        ok: true,
        couponCode: 'FLOWER100',
        discount
      });
    });

    it('商品小計 799 元未達門檻', () => {
      expect(applyCoupon({ code: 'FLOWER100', subtotal: 799 })).toMatchObject({
        ok: false,
        error: 'COUPON_MIN_SUBTOTAL_NOT_MET'
      });
    });
  });

  describe('SPRING10', () => {
    it.each([
      [1000, 100],
      [1234, 123],
      [1235, 124],
      [3000, 300],
      [3500, 300],
      [0, 0]
    ])('商品小計 %i 元折抵 %i 元（四捨五入、上限 300 元）', (subtotal, discount) => {
      expect(applyCoupon({ code: 'SPRING10', subtotal })).toMatchObject({ ok: true, discount });
    });
  });

  it('SUMMER50 已失效', () => {
    expect(applyCoupon({ code: 'SUMMER50', subtotal: 1000 })).toMatchObject({
      ok: false,
      error: 'COUPON_EXPIRED'
    });
  });

  it.each(['NOT-A-COUPON', 'toString', '__proto__', 'constructor'])('不存在的優惠碼 %s', (code) => {
    expect(applyCoupon({ code, subtotal: 1000 })).toMatchObject({
      ok: false,
      error: 'COUPON_INVALID'
    });
  });

  it('優惠碼不分大小寫並去除前後空白，以大寫記錄', () => {
    expect(applyCoupon({ code: '  flower100 ', subtotal: 800 })).toMatchObject({
      ok: true,
      couponCode: 'FLOWER100'
    });
  });

  it('失敗時附上錯誤訊息', () => {
    const result = applyCoupon({ code: 'NOPE', subtotal: 1000 });
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(0);
  });

  it.each([
    ['非字串的優惠碼', { code: 100, subtotal: 1000 }],
    ['負數小計', { code: 'SPRING10', subtotal: -1 }]
  ])('拒絕%s', (_label, input) => {
    expect(() => applyCoupon(input)).toThrow(TypeError);
  });
});
