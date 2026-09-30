import React, { useEffect, useState } from 'react';

function formatarDataHoraBR(dataISO) {
  if (!dataISO) return '-';
  const d = new Date(dataISO);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function LancamentosList({ token }) {
  const [lancamentos, setLancamentos] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchLancamentos() {
      setError('');
      try {
        const res = await fetch('http://localhost:3000/lancamentos', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Erro ao buscar lançamentos');
        setLancamentos(await res.json());
      } catch (err) {
        setError(err.message || 'Erro ao buscar lançamentos');
      }
    }
    fetchLancamentos();
  }, [token]);

  return (
    <div style={{ marginTop: 32 }}>
      <h2>Lançamentos</h2>
      {error && <div style={{ color: 'red', marginBottom: 12 }}>{error}</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fafbfc' }}>
        <thead style={{ background: '#f0f4f8' }}>
          <tr>
            <th style={{ padding: 8, borderBottom: '1px solid #ddd' }}>Data/Hora</th>
            <th style={{ padding: 8, borderBottom: '1px solid #ddd' }}>Descrição</th>
            <th style={{ padding: 8, borderBottom: '1px solid #ddd' }}>Valor</th>
            <th style={{ padding: 8, borderBottom: '1px solid #ddd' }}>Tipo</th>
          </tr>
        </thead>
        <tbody>
          {lancamentos.map(l => {
            const tipo = l.tipo || l.tipo_movimento || '-';
            const isCredito = tipo.toUpperCase() === 'CREDITO';
            const isDebito = tipo.toUpperCase() === 'DEBITO';
            return (
              <tr key={l.id} style={{ background: isCredito ? '#e8f5e9' : isDebito ? '#ffebee' : undefined }}>
                <td style={{ padding: 8, borderBottom: '1px solid #eee', textAlign: 'center' }}>{formatarDataHoraBR(l.data || l.criado_em)}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{l.descricao}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #eee', textAlign: 'right', color: isCredito ? '#2e7d32' : isDebito ? '#c62828' : undefined, fontWeight: 600 }}>
                  {l.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </td>
                <td style={{ padding: 8, borderBottom: '1px solid #eee', textAlign: 'center', color: isCredito ? '#2e7d32' : isDebito ? '#c62828' : undefined, fontWeight: 600 }}>
                  {tipo.charAt(0) + tipo.slice(1).toLowerCase()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
