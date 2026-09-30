import React, { useState } from 'react';

const tipos = [
  { value: 'CREDITO', label: 'Crédito' },
  { value: 'DEBITO', label: 'Débito' },
];

export default function LancamentoForm({ onSubmit }) {
  const [dados, setDados] = useState({ descricao: '', valor: '', tipo_movimento: 'CREDITO', criado_em: '' });
  const [error, setError] = useState('');

  const handleChange = e => {
    const { name, value } = e.target;
    setDados(v => ({ ...v, [name]: value }));
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    try {
      await onSubmit({
        tipo_movimento: dados.tipo_movimento,
        valor: parseFloat(dados.valor),
        descricao: dados.descricao,
        criado_em: dados.criado_em ? new Date(dados.criado_em).toISOString() : undefined,
      });
      setDados({ descricao: '', valor: '', tipo_movimento: 'CREDITO', criado_em: '' });
    } catch (err) {
      setError(err.message || 'Erro ao cadastrar lançamento');
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{
      margin: '32px auto',
      padding: 24,
      border: '1px solid #eee',
      borderRadius: 12,
      background: '#fafbfc',
      maxWidth: 420,
      boxShadow: '0 2px 8px #0001',
      fontFamily: 'sans-serif',
    }}>
      <h2 style={{ marginBottom: 24, color: '#1976d2', fontWeight: 700 }}>Adicionar Lançamento</h2>
      <div style={{ marginBottom: 18 }}>
        <label style={{ fontWeight: 500 }}>Tipo<br />
          <select name="tipo_movimento" value={dados.tipo_movimento} onChange={handleChange} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ccc', marginTop: 4 }}>
            {tipos.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
      </div>
      <div style={{ marginBottom: 18 }}>
        <label style={{ fontWeight: 500 }}>Valor<br />
          <input name="valor" type="number" step="0.01" value={dados.valor} onChange={handleChange} required style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ccc', marginTop: 4 }} />
        </label>
      </div>
      <div style={{ marginBottom: 18 }}>
        <label style={{ fontWeight: 500 }}>Descrição<br />
          <input name="descricao" value={dados.descricao} onChange={handleChange} required style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ccc', marginTop: 4 }} />
        </label>
      </div>
      <div style={{ marginBottom: 18 }}>
        <label style={{ fontWeight: 500 }}>Data/Hora<br />
          <input name="criado_em" type="datetime-local" value={dados.criado_em} onChange={handleChange} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ccc', marginTop: 4 }} />
        </label>
      </div>
      {error && <div style={{ color: 'red', marginBottom: 16, fontWeight: 600 }}>{error}</div>}
      <button type="submit" style={{
        background: '#1976d2',
        color: '#fff',
        border: 'none',
        borderRadius: 8,
        padding: '10px 32px',
        fontWeight: 700,
        fontSize: 16,
        cursor: 'pointer',
        marginTop: 8,
        boxShadow: '0 1px 4px #0001',
      }}>Cadastrar</button>
    </form>
  );
}
