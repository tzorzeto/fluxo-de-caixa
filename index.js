require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('path');

const db = require('./src/db');
const { createRabbit, QUEUE_LANCAMENTOS } = require('./src/rabbit');
const { authMiddleware } = require('./src/auth');

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(',');
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
}));
app.use(express.json({ limit: '10kb' }));

app.use('/docs', swaggerUi.serve, swaggerUi.setup(YAML.load(path.join(__dirname, 'openapi.yaml'))));

// A API sobe mesmo sem RabbitMQ: consultas de saldo continuam funcionando e
// só o POST /lancamentos responde 503 até a fila voltar.
const rabbit = createRabbit();

app.use('/', require('./src/routes/auth'));
app.use('/lancamentos', require('./src/routes/lancamentos')({ rabbit }));
app.use('/saldos-diarios', require('./src/routes/saldosDiarios'));

const adminRoutes = require('./src/routes/admin');
if (adminRoutes) app.use('/admin', adminRoutes);

// Compatibilidade com o frontend antigo.
app.post('/reprocessar-saldo/:data', authMiddleware, (req, res) => {
  res.redirect(307, `/saldos-diarios/${req.params.data}/reprocessar`);
});

// Health check sem autenticação, para load balancer/orquestrador.
app.get('/health', (req, res) => res.json({ ok: true }));

app.get('/status', authMiddleware, async (req, res) => {
  const status = {};
  try {
    await db.query('SELECT 1');
    status.PostgreSQL = { ok: true, msg: 'Conectado' };
  } catch (e) {
    status.PostgreSQL = { ok: false, msg: e.message };
  }
  status.RabbitMQ = rabbit.isConnected()
    ? { ok: true, msg: `Conectado (fila ${QUEUE_LANCAMENTOS})` }
    : { ok: false, msg: 'Desconectado' };
  status.API = { ok: true, msg: 'Rodando' };
  res.json(status);
});

app.use((err, req, res, next) => {
  if (err.message === 'Not allowed by CORS') return res.status(403).json({ error: err.message });
  console.error('Erro não tratado:', err);
  res.status(500).json({ error: 'Erro interno' });
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  rabbit.connect();
  app.listen(PORT, () => console.log(`API rodando em http://localhost:${PORT}`));
}

module.exports = { app, rabbit };
