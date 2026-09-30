import React, { useEffect, useState } from 'react';

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
  const soData = dataISO.split('T')[0];
  const [ano, mes, dia] = soData.split('-');
  if (!ano || !mes || !dia) return dataISO;
  return `${dia}/${mes}/${ano}`;
}

export default function SaldosDiariosList({ token }) {
  const [saldos, setSaldos] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchSaldos() {
      setError('');
      try {
        const res = await fetch('http://localhost:3000/saldos-diarios', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Erro ao buscar saldos');
        setSaldos(await res.json());
      } catch (err) {
        setError(err.message || 'Erro ao buscar saldos');
      }
    }
    fetchSaldos();
  }, [token]);

  return (
    <div style={{ marginTop: 32 }}>
      <h2>Saldos Diários</h2>
      {error && <div style={{ color: 'red', marginBottom: 12 }}>{error}</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fafbfc' }}>
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
          {saldos.map(s => (
            <tr key={s.data}>
              <td style={{ padding: 8, borderBottom: '1px solid #eee', textAlign: 'center' }}>{formatarDataBR(s.data)}</td>
              <td style={{ padding: 8, borderBottom: '1px solid #eee', textAlign: 'right' }}>{formatarBRL(s.saldo_inicio)}</td>
              <td style={{ padding: 8, borderBottom: '1px solid #eee', textAlign: 'right', color: '#2e7d32', fontWeight: 600, background: '#e8f5e9' }}>{formatarBRL(s.total_creditos)}</td>
              <td style={{ padding: 8, borderBottom: '1px solid #eee', textAlign: 'right', color: '#c62828', fontWeight: 600, background: '#ffebee' }}>{formatarBRL(s.total_debitos)}</td>
              <td style={{ padding: 8, borderBottom: '1px solid #eee', textAlign: 'right', fontWeight: 600 }}>{formatarBRL(s.saldo_fim)}</td>
              <td style={{ padding: 8, borderBottom: '1px solid #eee', textAlign: 'center' }}><StatusDia s={s} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
