const { rateLimit } = require("express-rate-limit");

const positiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const createLoginRateLimit = ({
  windowMinutes = process.env.LOGIN_RATE_LIMIT_WINDOW_MINUTES,
  maxAttempts = process.env.LOGIN_RATE_LIMIT_MAX,
} = {}) =>
  rateLimit({
    windowMs: positiveInteger(windowMinutes, 15) * 60 * 1000,
    limit: positiveInteger(maxAttempts, 10),
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: (_req, res) => {
      res.status(429).json({
        error:
          "Çok fazla başarısız giriş denemesi yapıldı. Lütfen daha sonra tekrar deneyin.",
      });
    },
  });

const loginRateLimit = createLoginRateLimit();

module.exports = {
  createLoginRateLimit,
  loginRateLimit,
};
