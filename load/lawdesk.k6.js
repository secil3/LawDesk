import http from "k6/http";
import { check, fail, sleep } from "k6";

const BASE_URL = String(__ENV.BASE_URL || "http://127.0.0.1:8080")
  .replace(/\/$/, "");
const COOKIE_NAME = __ENV.AUTH_COOKIE_NAME || "lawdesk_session";
const USER_COUNT = Number(__ENV.LOAD_TEST_USER_COUNT || "70");
const USER_PASSWORD = __ENV.LOAD_TEST_USER_PASSWORD;
const PROFILE = __ENV.LOAD_PROFILE || "smoke";

const PROFILES = {
  smoke: [
    { duration: "5s", target: 5 },
    { duration: "15s", target: 5 },
    { duration: "5s", target: 0 },
  ],
  standard: [
    { duration: "30s", target: 25 },
    { duration: "2m", target: 25 },
    { duration: "30s", target: 0 },
  ],
  peak: [
    { duration: "1m", target: 70 },
    { duration: "2m", target: 70 },
    { duration: "30s", target: 0 },
  ],
};

if (!PROFILES[PROFILE]) {
  throw new Error("LOAD_PROFILE must be smoke, standard or peak");
}

if (!Number.isInteger(USER_COUNT) || USER_COUNT < 1 || USER_COUNT > 200) {
  throw new Error("LOAD_TEST_USER_COUNT must be between 1 and 200");
}

export const options = {
  setupTimeout: "2m",
  discardResponseBodies: true,
  scenarios: {
    lawdesk_read_load: {
      executor: "ramping-vus",
      stages: PROFILES[PROFILE],
      gracefulRampDown: "15s",
    },
  },
  thresholds: {
    checks: ["rate>0.99"],
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1000", "p(99)<2000"],
  },
};

const userEmail = (index) => {
  return `load.user.${String(index).padStart(3, "0")}@lawdesk.test`;
};

export function setup() {
  if (!USER_PASSWORD) {
    fail("LOAD_TEST_USER_PASSWORD is required");
  }

  const cookieHeaders = [];

  for (let index = 1; index <= USER_COUNT; index += 1) {
    const response = http.post(
      `${BASE_URL}/api/auth/login`,
      JSON.stringify({
        email: userEmail(index),
        password: USER_PASSWORD,
      }),
      {
        headers: { "Content-Type": "application/json" },
        tags: { endpoint: "login_setup" },
      },
    );
    const cookie = response.cookies[COOKIE_NAME]?.[0]?.value;
    const loginSucceeded = check(response, {
      "load user login succeeds": (result) =>
        result.status === 200 && Boolean(cookie),
    });

    if (!loginSucceeded) {
      fail(`Load user ${index} could not log in (HTTP ${response.status})`);
    }

    cookieHeaders.push(`${COOKIE_NAME}=${cookie}`);
  }

  return { cookieHeaders };
}

export default function (data) {
  const cookieHeader = data.cookieHeaders[(__VU - 1) % data.cookieHeaders.length];
  const requestOptions = {
    headers: {
      Cookie: cookieHeader,
      Accept: "application/json",
    },
  };
  const responses = http.batch([
    ["GET", `${BASE_URL}/api/auth/me`, null, {
      ...requestOptions,
      tags: { endpoint: "session" },
    }],
    ["GET", `${BASE_URL}/api/tasks?page=1&limit=10`, null, {
      ...requestOptions,
      tags: { endpoint: "task_list" },
    }],
    ["GET", `${BASE_URL}/api/tasks/dashboard-summary`, null, {
      ...requestOptions,
      tags: { endpoint: "dashboard" },
    }],
    ["GET", `${BASE_URL}/api/tasks/options`, null, {
      ...requestOptions,
      tags: { endpoint: "task_options" },
    }],
    ["GET", `${BASE_URL}/api/notifications/unread-count`, null, {
      ...requestOptions,
      tags: { endpoint: "notifications" },
    }],
  ]);

  check(responses, {
    "authenticated page APIs return 200": (results) =>
      results.every((response) => response.status === 200),
  });
  sleep(2 + Math.random() * 2);
}
