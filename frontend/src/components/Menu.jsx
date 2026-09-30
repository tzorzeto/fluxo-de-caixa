import React from 'react';

export default function Menu({ onSelect }) {
  return (
    <div style={{ marginTop: 32 }}>
      <h2>Menu</h2>
      <button style={{ margin: 8 }} onClick={() => onSelect('adicionar')}>Adicionar Lançamento</button>
      <button style={{ margin: 8 }} onClick={() => onSelect('lancamentos')}>Consultar Lançamentos</button>
      <button style={{ margin: 8 }} onClick={() => onSelect('saldos')}>Consultar Saldos Diários</button>
      <button style={{ margin: 8 }} onClick={() => onSelect('saldoData')}>Consultar Saldo por Data</button>
      <button style={{ margin: 8 }} onClick={() => onSelect('reprocessar')}>Reprocessar Saldo</button>
      <button style={{ margin: 8 }} onClick={() => onSelect('status')}>Status dos Serviços</button>
    </div>
  );
}
