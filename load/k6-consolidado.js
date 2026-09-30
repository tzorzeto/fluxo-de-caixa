// RNF-02: consolidado diário a 50 req/s com no máximo 5% de perda.
// Uso: docker run --rm -i --network host -e API_URL=http://localhost:3000 grafana/k6 run - < load/k6-consolidado.js
import http from 'k6/http';
import { check } from 'k6';

const API_URL = __ENV.API_URL || 'http://localhost:3000';
const RATE = Number(__ENV.RATE || 50);
const DURATION = __ENV.DURATION || '2m';

// Datas com saldo consolidado: o seed cobre os últimos 10 dias.
const DATAS = Array.from({ length: 10 }, (_, i) => {
  const d = new Date(); d.setUTCDate(d.getUTCDate() - (i + 1)); return d.toISOString().slice(0, 10);
});

export const options = {
  scenarios: {
    consolidado: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: 20,
      maxVUs: 200,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],      // ≤ 5% de perda (enunciado)
    http_req_duration: ['p(95)<500'],    // meta própria; ajuste em docs/02-requisitos.md
  },
};

export function setup() {
  const res = http.post(`${API_URL}/login`, JSON.stringify({ email: 'admin@example.com', senha: '123456' }), {
    headers: { 'Content-Type': 'application/json' },
  });
  return { token: res.json('token') };
}

export default function ({ token }) {
  const data = DATAS[Math.floor(Math.random() * DATAS.length)];
  const res = http.get(`${API_URL}/saldos-diarios/${data}`, {
    headers: { Authorization: `Bearer ${token}` },
    tags: { name: 'GET /saldos-diarios/{data}' },
  });
  check(res, { 'status 200': (r) => r.status === 200 });
}
