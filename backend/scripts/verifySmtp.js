require("dotenv").config();

const { verifyEmailConnection } = require("../services/emailService");

const verifySmtp = async () => {
  if (process.env.NODE_ENV !== "production") {
    throw new Error("NODE_ENV must be production for this check");
  }

  await verifyEmailConnection();
  console.log("SMTP connection and authentication succeeded");
};

verifySmtp().catch((error) => {
  console.error(`SMTP verification failed: ${error.message}`);
  process.exitCode = 1;
});
