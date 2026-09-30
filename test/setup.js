// Fora do Docker, banco e fila ficam em localhost.
require('dotenv').config({ quiet: true });
process.env.PGHOST = process.env.TEST_PGHOST || 'localhost';
process.env.RABBITMQ_URL = process.env.TEST_RABBITMQ_URL || 'amqp://admin:admin@localhost:5672';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'test-admin';
