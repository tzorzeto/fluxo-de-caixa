import React, { useState } from 'react';
import LancamentoForm from './LancamentoForm';
import Menu from './Menu';
import LancamentosList from './LancamentosList';
import SaldosDiariosList from './SaldosDiariosList';
import SaldoDiarioPorData from './SaldoDiarioPorData';
import ReprocessarSaldo from './ReprocessarSaldo';
import StatusPage from './StatusPage';

const API_URL = 'http://localhost:3000';

export default function AppLancamentos() {
  const [token, setToken] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginData, setLoginData] = useState({ email: '', senha: '' });
  const [msg, setMsg] = useState('');
  const [page, setPage] = useState('menu');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setMsg('');
    try {
      const res = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginData),
      });
      if (!res.ok) throw new Error('Login inválido');
      const data = await res.json();
      setToken(data.token);
      setMsg('Login realizado!');
      setPage('menu');
    } catch (err) {
      setLoginError(err.message || 'Erro ao logar');
    }
  };

  const handleLancamento = async (dados) => {
    setMsg('');
    if (!token) throw new Error('Faça login primeiro!');
    const res = await fetch(`${API_URL}/lancamentos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(dados),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro ao cadastrar lançamento');
    }
    setMsg('Lançamento cadastrado com sucesso!');
  };

  // Renderização condicional
  if (!token) {
    return (
      <div style={{ fontFamily: 'sans-serif', maxWidth: 500, margin: '2rem auto' }}>
        <h1>Financeiro - Cadastro de Lançamentos</h1>
        <form onSubmit={handleLogin} style={{ marginBottom: 24, padding: 16, border: '1px solid #eee', borderRadius: 8 }}>
          <h2>Login</h2>
          <div style={{ marginBottom: 12 }}>
            <label>Email:&nbsp;
              <input type="email" value={loginData.email} onChange={e => setLoginData(v => ({ ...v, email: e.target.value }))} required />
            </label>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label>Senha:&nbsp;
              <input type="password" value={loginData.senha} onChange={e => setLoginData(v => ({ ...v, senha: e.target.value }))} required />
            </label>
          </div>
          {loginError && <div style={{ color: 'red', marginBottom: 12 }}>{loginError}</div>}
          <button type="submit">Entrar</button>
        </form>
      </div>
    );
  }

  // Menu e páginas
  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: 700, margin: '2rem auto' }}>
      <h1>Financeiro - Sistema</h1>
      <button onClick={() => { setToken(''); setPage('menu'); setMsg(''); }}>Logout</button>
      {msg && <div style={{ color: 'green', marginTop: 16 }}>{msg}</div>}
      {page === 'menu' && <Menu onSelect={p => { setPage(p); setMsg(''); }} />}
      {page === 'adicionar' && <LancamentoForm onSubmit={handleLancamento} />}
      {page === 'lancamentos' && <LancamentosList token={token} />}
      {page === 'saldos' && <SaldosDiariosList token={token} />}
      {page === 'saldoData' && <SaldoDiarioPorData token={token} />}
      {page === 'reprocessar' && <ReprocessarSaldo token={token} />}
      {page === 'status' && <StatusPage token={token} />}
      {page !== 'menu' && <button style={{ marginTop: 24 }} onClick={() => { setPage('menu'); setMsg(''); }}>Voltar ao Menu</button>}
    </div>
  );
}
