const COUPON_TYPES = Object.freeze({
  FIXED: 'fixed',
  PERCENT: 'percent'
});

// Codes are stored upper-case; lookups normalise the input first
const COUPONS = Object.freeze({
  FLOWER100: Object.freeze({ type: COUPON_TYPES.FIXED, amount: 100, minSubtotal: 800, active: true }),
  SPRING10: Object.freeze({ type: COUPON_TYPES.PERCENT, rate: 0.1, maxDiscount: 300, minSubtotal: 0, active: true }),
  SUMMER50: Object.freeze({ type: COUPON_TYPES.FIXED, amount: 50, minSubtotal: 0, active: false })
});

const COUPON_ERRORS = Object.freeze({
  NOT_FOUND: { error: 'COUPON_INVALID', message: '優惠碼不存在' },
  INACTIVE: { error: 'COUPON_EXPIRED', message: '優惠碼已失效' },
  BELOW_MIN: { error: 'COUPON_MIN_SUBTOTAL_NOT_MET', message: '商品小計未達優惠碼使用門檻' }
});

function normalizeCouponCode(code) {
  return code.trim().toUpperCase();
}

function calculateDiscount(coupon, subtotal) {
  const raw = coupon.type === COUPON_TYPES.PERCENT
    ? Math.min(Math.round(subtotal * coupon.rate), coupon.maxDiscount)
    : coupon.amount;
  // A discount can never push the subtotal below zero
  return Math.min(raw, subtotal);
}

/**
 * Validate a coupon code against an order subtotal.
 * Returns { ok: true, couponCode, discount } or { ok: false, error, message }.
 * The discount only applies to the subtotal, never to shipping.
 */
function applyCoupon({ code, subtotal }) {
  if (typeof code !== 'string') {
    throw new TypeError('code 必須為字串');
  }
  if (!Number.isFinite(subtotal) || subtotal < 0) {
    throw new TypeError('subtotal 必須為非負有限數');
  }

  const couponCode = normalizeCouponCode(code);
  const coupon = Object.prototype.hasOwnProperty.call(COUPONS, couponCode) ? COUPONS[couponCode] : null;

  if (!coupon) {
    return { ok: false, ...COUPON_ERRORS.NOT_FOUND };
  }
  if (!coupon.active) {
    return { ok: false, ...COUPON_ERRORS.INACTIVE };
  }
  if (subtotal < coupon.minSubtotal) {
    return { ok: false, ...COUPON_ERRORS.BELOW_MIN };
  }

  return { ok: true, couponCode, discount: calculateDiscount(coupon, subtotal) };
}

module.exports = {
  COUPON_TYPES,
  COUPONS,
  normalizeCouponCode,
  applyCoupon
};
