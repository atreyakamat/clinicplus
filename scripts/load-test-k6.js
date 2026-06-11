import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    load_100: {
      executor: 'per-vu-iterations',
      vus: 100,
      iterations: 10,
      maxDuration: '1m',
    },
    load_250: {
      executor: 'per-vu-iterations',
      vus: 250,
      iterations: 5,
      maxDuration: '2m',
      startTime: '1m',
    },
    load_500: {
      executor: 'per-vu-iterations',
      vus: 500,
      iterations: 2,
      maxDuration: '3m',
      startTime: '3m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'], // 95% of requests must complete below 500ms
  },
};

const BASE_URL = 'http://localhost:3000/api/v1';

export function setup() {
  const loginRes = http.post(`${BASE_URL}/auth/login`, JSON.stringify({
    email: 'test-doctor@clinicplus.com',
    password: 'password123',
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  check(loginRes, { 'logged in': (r) => r.status === 201 || r.status === 200 });
  return { token: loginRes.json().accessToken };
}

export default function (data) {
  const params = {
    headers: {
      'Authorization': `Bearer ${data.token}`,
      'Content-Type': 'application/json',
    },
  };

  // 1. Patient Search
  const searchRes = http.get(`${BASE_URL}/patients/search?q=John`, params);
  check(searchRes, { 'patient search status 200': (r) => r.status === 200 });

  // 2. Dashboard
  const dashboardRes = http.get(`${BASE_URL}/analytics/dashboard/doctor`, params);
  check(dashboardRes, { 'dashboard status 200': (r) => r.status === 200 });

  // 3. Queue
  const queueRes = http.get(`${BASE_URL}/queues/live`, params);
  check(queueRes, { 'queue status 200': (r) => r.status === 200 });

  // 4. Billing
  const billingRes = http.get(`${BASE_URL}/invoices`, params);
  check(billingRes, { 'billing status 200': (r) => r.status === 200 });

  sleep(1);
}
