// RNF-02b: N tenants em pico simultâneo, cada um a 50 req/s no consolidado.
// Provisiona os tenants de carga no setup (exige ADMIN_TOKEN na API).
// Uso: docker run --rm -i --network host -e API_URL=http://localhost:3000 \
//        -e ADMIN_TOKEN=... -e TENANTS=20 grafana/k6 run - < load/k6-consolidado-multitenant.js
import http from 'k6/http';
import { check } from 'k6';

const API_URL = __ENV.API_URL || 'http://localhost:3000';
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN;
const TENANTS = Number(__ENV.TENANTS || 20);
const RATE_POR_TENANT = Number(__ENV.RATE || 50);
const DURATION = __ENV.DURATION || '2m';
const RUN = __ENV.RUN || Date.now();

export const options = {
  scenarios: {
    multitenant: {
      executor: 'constant-arrival-rate',
      rate: TENANTS * RATE_POR_TENANT,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: 50,
      maxVUs: 1000,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<500'],
  },
};

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function setup() {
  if (!ADMIN_TOKEN) throw new Error('ADMIN_TOKEN é obrigatório');
  const tokens = [];
  for (let i = 0; i < TENANTS; i++) {
    const email = `carga-${RUN}-${i}@example.com`;
    const criado = http.post(`${API_URL}/admin/tenants`, JSON.stringify({
      nome: `Carga ${RUN} ${i}`,
      usuario: { email, senha: 'carga123' },
    }), { headers: { ...JSON_HEADERS, Authorization: `Bearer ${ADMIN_TOKEN}` } });
    if (criado.status !== 201) throw new Error(`falha ao criar tenant ${i}: ${criado.status} ${criado.body}`);

    const login = http.post(`${API_URL}/login`, JSON.stringify({ email, senha: 'carga123' }), { headers: JSON_HEADERS });
    const token = login.json('token');

    // Um lançamento de hoje para o tenant ter saldo consolidado.
    http.post(`${API_URL}/lancamentos`, JSON.stringify({ tipo_movimento: 'CREDITO', valor: 100 }), {
      headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}` },
    });
    tokens.push(token);
  }
  const hoje = new Date().toISOString().slice(0, 10);
  return { tokens, hoje };
}

export default function ({ tokens, hoje }) {
  const token = tokens[Math.floor(Math.random() * tokens.length)];
  const res = http.get(`${API_URL}/saldos-diarios/${hoje}`, {
    headers: { Authorization: `Bearer ${token}` },
    tags: { name: 'GET /saldos-diarios/{hoje}' },
  });
  check(res, { 'status 200': (r) => r.status === 200 });
}
