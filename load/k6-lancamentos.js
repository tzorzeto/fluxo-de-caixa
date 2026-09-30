// Carga no POST /lancamentos: mede taxa de 202 e permite conferir no banco
// que nada se perdeu na fila (count(*) deve bater com o número de 202).
// Uso: docker run --rm -i --network host -e API_URL=http://localhost:3000 grafana/k6 run - < load/k6-lancamentos.js
import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const API_URL = __ENV.API_URL || 'http://localhost:3000';
const RATE = Number(__ENV.RATE || 50);
const DURATION = __ENV.DURATION || '1m';
const DESCRICAO = __ENV.DESCRICAO || `k6-${Date.now()}`;

const aceitos = new Counter('lancamentos_aceitos');

export const options = {
  scenarios: {
    lancamentos: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: 20,
      maxVUs: 200,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
  },
};

export function setup() {
  const res = http.post(`${API_URL}/login`, JSON.stringify({ email: 'admin@example.com', senha: '123456' }), {
    headers: { 'Content-Type': 'application/json' },
  });
  return { token: res.json('token') };
}

export default function ({ token }) {
  const body = {
    tipo_movimento: Math.random() < 0.5 ? 'CREDITO' : 'DEBITO',
    valor: Number((Math.random() * 100 + 1).toFixed(2)),
    descricao: DESCRICAO,
  };
  const res = http.post(`${API_URL}/lancamentos`, JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    tags: { name: 'POST /lancamentos' },
  });
  if (check(res, { 'status 202': (r) => r.status === 202 })) aceitos.add(1);
}

export function teardown() {
  console.log(`Confira no banco: SELECT count(*) FROM lancamentos_financeiros WHERE descricao = '${DESCRICAO}';`);
}
