const net = require("node:net");

const getListenerConfig = (environment = process.env) => {
  const production = environment.NODE_ENV === "production";
  const configuredHost = String(
    environment.BACKEND_BIND_ADDRESS ?? "",
  ).trim();

  if (production && !configuredHost) {
    throw new Error(
      "BACKEND_BIND_ADDRESS is required in production",
    );
  }

  const host = configuredHost || "127.0.0.1";

  if (net.isIP(host) === 0) {
    throw new Error(
      "BACKEND_BIND_ADDRESS must be an IPv4 or IPv6 address",
    );
  }

  const normalizedPort = String(environment.PORT ?? "3001").trim();
  const port = Number(normalizedPort);

  if (
    !/^\d+$/.test(normalizedPort) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  return { host, port };
};

module.exports = { getListenerConfig };
