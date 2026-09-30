import React, { useState } from 'react';

function formatarBRL(v) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function StatusDia({ s }) {
  const fechado = s.status === 'fechado';
  const titulo = fechado
    ? `Fechado em ${s.fechado_em ? new Date(s.fechado_em).toLocaleString('pt-BR') : ''}`
    : 'Dia aberto: saldo parcial';
  return (
    <span title={titulo} style={{ padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 600,
      background: fechado ? '#e0e0e0' : '#fff8e1', color: fechado ? '#424242' : '#8d6e00' }}>
      {fechado ? 'Fechado' : 'Aberto'}{s.reaberto_em ? ' (reaberto)' : ''}
    </span>
  );
}

function formatarDataBR(dataISO) {
  if (!dataISO) return '-';
  // Remove hora se vier no formato ISO completo
  const soData = dataISO.split('T')[0];
  const [ano, mes, dia] = soData.split('-');
  if (!ano || !mes || !dia) return dataISO;
  return `${dia}/${mes}/${ano}`;
}

export default function SaldoDiarioPorData({ token }) {
  const [data, setData] = useState('');
  const [saldo, setSaldo] = useState(null);
  const [error, setError] = useState('');

  const handleBuscar = async e => {
    e.preventDefault();
    setError('');
    setSaldo(null);
    try {
      const res = await fetch(`http://localhost:3000/saldos-diarios/${data}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Saldo não encontrado');
      setSaldo(await res.json());
    } catch (err) {
      setError(err.message || 'Erro ao buscar saldo');
    }
  };

  return (
    <div style={{ marginTop: 32, maxWidth: 400 }}>
      <h2>Consultar Saldo Diário por Data</h2>
      <form onSubmit={handleBuscar} style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        <label>
          Data: <input type="date" value={data} onChange={e => setData(e.target.value)} required style={{ padding: 4 }} />
        </label>
        <button type="submit">Buscar</button>
      </form>
      {error && <div style={{ color: 'red', marginBottom: 12 }}>{error}</div>}
      {saldo && (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fafbfc', marginTop: 16 }}>
          <thead style={{ background: '#f0f4f8' }}>
            <tr>
              <th style={{ padding: 8, borderBottom: '1px solid #ddd' }}>Data</th>
              <th style={{ padding: 8, borderBottom: '1px solid #ddd' }}>Saldo Início</th>
              <th style={{ padding: 8, borderBottom: '1px solid #ddd' }}>Créditos</th>
              <th style={{ padding: 8, borderBottom: '1px solid #ddd' }}>Débitos</th>
              <th style={{ padding: 8, borderBottom: '1px solid #ddd' }}>Saldo Fim</th>
              <th style={{ padding: 8, borderBottom: '1px solid #ddd' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: 8, borderBottom: '1px solid #eee', textAlign: 'center' }}>{formatarDataBR(saldo.data)}</td>
              <td style={{ padding: 8, borderBottom: '1px solid #eee', textAlign: 'right' }}>{formatarBRL(saldo.saldo_inicio)}</td>
              <td style={{ padding: 8, borderBottom: '1px solid #eee', textAlign: 'right', color: '#2e7d32', fontWeight: 600, background: '#e8f5e9' }}>{formatarBRL(saldo.total_creditos)}</td>
              <td style={{ padding: 8, borderBottom: '1px solid #eee', textAlign: 'right', color: '#c62828', fontWeight: 600, background: '#ffebee' }}>{formatarBRL(saldo.total_debitos)}</td>
              <td style={{ padding: 8, borderBottom: '1px solid #eee', textAlign: 'right', fontWeight: 600 }}>{formatarBRL(saldo.saldo_fim)}</td>
              <td style={{ padding: 8, borderBottom: '1px solid #eee', textAlign: 'center' }}><StatusDia s={saldo} /></td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}
