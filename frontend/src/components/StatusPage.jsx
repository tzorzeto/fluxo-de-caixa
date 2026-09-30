import React, { useState } from 'react';

export default function StatusPage({ token }) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');

  const handleCheck = async () => {
    setError('');
    setStatus(null);
    try {
      const res = await fetch('http://localhost:3000/status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Erro ao consultar status');
      setStatus(await res.json());
    } catch (err) {
      setError(err.message || 'Erro ao consultar status');
    }
  };

  return (
    <div style={{ marginTop: 32, maxWidth: 500, fontFamily: 'sans-serif' }}>
      <h2>Status dos Serviços</h2>
      <button onClick={handleCheck} style={{ padding: '8px 20px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', marginBottom: 16 }}>Verificar Status</button>
      {error && <div style={{ color: 'red', marginBottom: 12 }}>{error}</div>}
      {status && (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fafbfc', marginTop: 16, boxShadow: '0 2px 8px #0001', borderRadius: 8, overflow: 'hidden' }}>
          <thead style={{ background: '#f0f4f8' }}>
            <tr>
              <th style={{ padding: 12, borderBottom: '2px solid #1976d2', textAlign: 'left', fontSize: 16 }}>Serviço</th>
              <th style={{ padding: 12, borderBottom: '2px solid #1976d2', textAlign: 'center', fontSize: 16 }}>Status</th>
              <th style={{ padding: 12, borderBottom: '2px solid #1976d2', textAlign: 'left', fontSize: 16 }}>Mensagem</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(status).map(([servico, info]) => (
              <tr key={servico} style={{ background: info.ok ? '#e8f5e9' : '#ffebee' }}>
                <td style={{ padding: 12, borderBottom: '1px solid #eee', fontWeight: 600 }}>{servico}</td>
                <td style={{ padding: 12, borderBottom: '1px solid #eee', textAlign: 'center' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '4px 16px',
                    borderRadius: 16,
                    background: info.ok ? '#43a047' : '#c62828',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 15
                  }}>{info.ok ? 'OK' : 'FALHA'}</span>
                </td>
                <td style={{ padding: 12, borderBottom: '1px solid #eee', color: info.ok ? '#333' : '#c62828' }}>{info.msg}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
