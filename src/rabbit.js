const amqp = require('amqplib');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://admin:admin@localhost:5672';
const QUEUE_LANCAMENTOS = process.env.QUEUE_LANCAMENTOS || 'lancamentos';
const DLX = `${QUEUE_LANCAMENTOS}.dlx`;
const DLQ = `${QUEUE_LANCAMENTOS}.dlq`;
const RECONNECT_MS = 5_000;

// Declara fila principal + dead-letter. Mensagens rejeitadas (nack sem requeue)
// vão para a DLQ em vez de serem descartadas.
async function assertTopology(ch) {
  await ch.assertExchange(DLX, 'fanout', { durable: true });
  await ch.assertQueue(DLQ, { durable: true });
  await ch.bindQueue(DLQ, DLX, '');
  await ch.assertQueue(QUEUE_LANCAMENTOS, {
    durable: true,
    deadLetterExchange: DLX,
  });
}

// Mantém um canal aberto e reconecta sozinho. `onChannel` é chamado a cada
// (re)conexão, para o consumer se registrar de novo.
function createRabbit({ onChannel, onClose } = {}) {
  let connection = null;
  let channel = null;
  let connecting = false;
  let stopped = false;

  async function connect() {
    if (connecting || stopped) return;
    connecting = true;
    try {
      const conn = await amqp.connect(RABBITMQ_URL);
      const ch = await conn.createChannel();
      await assertTopology(ch);
      connection = conn;
      channel = ch;
      console.log('RabbitMQ conectado, fila:', QUEUE_LANCAMENTOS);

      conn.on('close', () => {
        connection = null;
        channel = null;
        console.error('Conexão RabbitMQ fechada; tentando reconectar...');
        onClose?.();
        if (!stopped) setTimeout(connect, RECONNECT_MS);
      });
      conn.on('error', (err) => console.error('Erro RabbitMQ:', err.message));

      if (onChannel) await onChannel(ch);
    } catch (err) {
      channel = null;
      console.error('Falha ao conectar no RabbitMQ:', err.message);
      if (!stopped) setTimeout(connect, RECONNECT_MS);
    } finally {
      connecting = false;
    }
  }

  return {
    connect,
    getChannel: () => channel,
    isConnected: () => channel !== null,
    // Encerra sem reconectar (shutdown limpo / fim dos testes).
    close: async () => {
      stopped = true;
      const conn = connection;
      connection = null;
      channel = null;
      if (conn) await conn.close().catch(() => {});
    },
  };
}

module.exports = { createRabbit, QUEUE_LANCAMENTOS, DLQ };
