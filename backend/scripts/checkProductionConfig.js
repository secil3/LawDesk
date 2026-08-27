require("dotenv").config();

const { getAuthConfig } = require("../config/auth");
const { getDatabaseConfig } = require("../config/database");
const { getHttpConfig } = require("../config/http");
const { getListenerConfig } = require("../config/listener");
const {
  assertNoProductionPlaceholders,
} = require("../config/production");
const { getEmailConfig } = require("../services/emailService");

const checkProductionConfig = () => {
  if (process.env.NODE_ENV !== "production") {
    throw new Error("NODE_ENV must be production for this check");
  }

  getAuthConfig();
  getDatabaseConfig();
  getHttpConfig();
  getListenerConfig();
  getEmailConfig();
  assertNoProductionPlaceholders();

  console.log("Production configuration is valid");
};

try {
  checkProductionConfig();
} catch (error) {
  console.error(`Production configuration is invalid: ${error.message}`);
  process.exitCode = 1;
}
