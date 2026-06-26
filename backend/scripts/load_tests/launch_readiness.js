import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const API_BASE_URL = __ENV.API_BASE_URL || 'http://localhost:8000/api';
const USERNAME = __ENV.USERNAME || 'DEMO';
const PASSWORD = __ENV.PASSWORD || '123';

const CONTROLLED_STATUSES = [200, 202, 400, 401, 402, 403, 409, 413, 429];
const controlledResponses = new Rate('controlled_responses');
const requestIdCoverage = new Rate('request_id_coverage');

http.setResponseCallback(http.expectedStatuses(...CONTROLLED_STATUSES));

export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || '1m',
  thresholds: {
    controlled_responses: ['rate>0.99'],
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<1500'],
    request_id_coverage: ['rate>0.95'],
  },
};

function jsonHeaders(extra = {}) {
  return { headers: { 'Content-Type': 'application/json', ...extra }, jar: http.cookieJar() };
}

function getHeader(res, name) {
  const expected = name.toLowerCase();
  const headerName = Object.keys(res.headers).find((key) => key.toLowerCase() === expected);
  return headerName ? res.headers[headerName] : '';
}

function isControlled(res, allowedStatuses) {
  const controlled = allowedStatuses.includes(res.status);
  controlledResponses.add(controlled);
  requestIdCoverage.add(Boolean(getHeader(res, 'x-request-id')));
  return controlled;
}

export default function () {
  const csrf = http.get(`${API_BASE_URL}/auth/csrf/`, { jar: http.cookieJar() });
  check(csrf, {
    'csrf controlled': (res) => isControlled(res, [200, 429]),
    'request id present': (res) => Boolean(getHeader(res, 'x-request-id')),
  });
  const csrfToken = getHeader(csrf, 'x-csrftoken');

  const login = http.post(
    `${API_BASE_URL}/auth/login/`,
    JSON.stringify({ username: USERNAME, password: PASSWORD }),
    jsonHeaders({ 'X-CSRFToken': csrfToken }),
  );
  check(login, {
    'login controlled': (res) => isControlled(res, [200, 401, 403, 429]),
  });

  const workspace = http.get(`${API_BASE_URL}/workspace/bootstrap/`, { jar: http.cookieJar() });
  check(workspace, {
    'workspace controlled': (res) => isControlled(res, [200, 401, 403, 429]),
  });

  const dashboard = http.get(`${API_BASE_URL}/dashboard/`, { jar: http.cookieJar() });
  check(dashboard, {
    'dashboard controlled': (res) => isControlled(res, [200, 401, 403, 429]),
  });

  const generation = http.post(
    `${API_BASE_URL}/generate/copy/`,
    JSON.stringify({
      async: true,
      brand_name: 'Load Test',
      product_description: 'Short controlled burst request',
    }),
    jsonHeaders({ 'X-CSRFToken': csrfToken, 'Idempotency-Key': `k6-${__VU}-${__ITER}` }),
  );
  check(generation, {
    'generation controlled': (res) => isControlled(res, [202, 400, 401, 402, 403, 409, 429]),
  });

  const oversized = http.post(
    `${API_BASE_URL}/generate/copy/`,
    JSON.stringify({
      brand_name: 'Load Test',
      product_description: 'x'.repeat(80 * 1024),
    }),
    jsonHeaders({ 'X-CSRFToken': csrfToken, 'Idempotency-Key': `k6-big-${__VU}-${__ITER}` }),
  );
  check(oversized, {
    'oversized rejected': (res) => isControlled(res, [400, 401, 403, 413, 429]),
  });

  sleep(1);
}
