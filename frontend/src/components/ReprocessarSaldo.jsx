import React, { useState } from 'react';

export default function ReprocessarSaldo({ token }) {
  const [data, setData] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const handleReprocessar = async e => {
    e.preventDefault();
    setMsg('');
    setError('');
    try {
      const res = await fetch(`http://localhost:3000/saldos-diarios/${data}/reprocessar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Erro ao reprocessar saldo');
      setMsg('Reprocessamento solicitado com sucesso!');
    } catch (err) {
      setError(err.message || 'Erro ao reprocessar saldo');
    }
  };

  return (
    <div style={{ marginTop: 32, maxWidth: 400 }}>
      <h2>Reprocessar Saldo Diário</h2>
      <form onSubmit={handleReprocessar} style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        <label>
          Data: <input type="date" value={data} onChange={e => setData(e.target.value)} required style={{ padding: 4 }} />
        </label>
        <button type="submit">Reprocessar</button>
      </form>
      {msg && <div style={{ color: 'green', marginBottom: 12 }}>{msg}</div>}
      {error && <div style={{ color: 'red', marginBottom: 12 }}>{error}</div>}
    </div>
  );
}
