const jwt = require('jsonwebtoken');
const { getTenant } = require('./tenants');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET não definido. Configure no .env (veja .env.example).');
}

// Valida o token e resolve o tenant do usuário (req.tenant).
function authMiddleware(req, res, next) {
  const [scheme, token] = (req.headers['authorization'] || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Token não informado' });
  }
  jwt.verify(token, JWT_SECRET, async (err, payload) => {
    if (err) return res.status(401).json({ error: 'Token inválido ou expirado' });
    let tenant;
    try {
      tenant = await getTenant(payload.comerciante_id);
    } catch (e) {
      // Catálogo indisponível: usa o snapshot do token, se houver, para não
      // derrubar o caminho de escrita junto com o banco (RNF-01).
      if (!payload.tenant) return res.status(503).json({ error: 'Catálogo de comerciantes indisponível' });
      console.warn(`Catálogo indisponível (${e.message}); usando configuração do token para o tenant ${payload.comerciante_id}`);
      tenant = payload.tenant;
    }
    if (!tenant) return res.status(403).json({ error: 'Comerciante não encontrado' });
    req.user = payload;
    req.tenant = tenant;
    next();
  });
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

module.exports = { authMiddleware, signToken };
