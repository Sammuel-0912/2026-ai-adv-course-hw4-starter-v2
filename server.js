const app = require('./app');

const PORT = process.env.PORT || 3001;

if (require.main === module) {
  if (!process.env.JWT_SECRET) {
    console.error('Fatal: JWT_SECRET is not set');
    process.exit(1);
  }
  // Production must not fall back to ECPay's public staging credentials
  if (process.env.ECPAY_ENV === 'production') {
    const missing = ['ECPAY_MERCHANT_ID', 'ECPAY_HASH_KEY', 'ECPAY_HASH_IV'].filter((name) => !process.env[name]);
    if (missing.length > 0) {
      console.error(`Fatal: ${missing.join(', ')} must be set when ECPAY_ENV=production`);
      process.exit(1);
    }
  }
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
