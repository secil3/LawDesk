const { rateLimit } = require("express-rate-limit");

const REGISTRATION_RESPONSE = Object.freeze({
  message:
    "Başvurunuz alınmıştır. İnceleme sonucunda e-posta gönderilecektir.",
});

const positiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const registrationRateLimit = rateLimit({
  windowMs:
    positiveInteger(
      process.env.REGISTRATION_RATE_LIMIT_WINDOW_MINUTES,
      15,
    ) *
    60 *
    1000,
  limit: positiveInteger(
    process.env.REGISTRATION_RATE_LIMIT_MAX,
    5,
  ),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(202).json(REGISTRATION_RESPONSE);
  },
});

module.exports = {
  REGISTRATION_RESPONSE,
  registrationRateLimit,
};
