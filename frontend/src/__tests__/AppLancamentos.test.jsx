import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AppLancamentos from '../components/AppLancamentos';
import StatusPage from '../components/StatusPage';
import SaldosDiariosList from '../components/SaldosDiariosList';
import SaldoDiarioPorData from '../components/SaldoDiarioPorData';

// Mock fetch global
beforeEach(() => {
  global.fetch = jest.fn();
});
afterEach(() => {
  jest.resetAllMocks();
});

describe('Frontend - AppLancamentos', () => {
  it('exibe tela de login inicialmente', () => {
    render(<AppLancamentos />);
    expect(screen.getByText(/login/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/senha/i)).toBeInTheDocument();
  });
});

describe('Frontend - StatusPage', () => {
  it('exibe status dos serviços corretamente', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        PostgreSQL: { ok: true, msg: 'Conectado' },
        RabbitMQ: { ok: true, msg: 'Conectado' },
        API: { ok: true, msg: 'Rodando' }
      })
    });
    render(<StatusPage token="fake-token" />);
    fireEvent.click(screen.getByText(/verificar status/i));
    await waitFor(() => {
      expect(screen.getByText(/PostgreSQL/)).toBeInTheDocument();
      expect(screen.getByText(/RabbitMQ/)).toBeInTheDocument();
      expect(screen.getByText(/API/)).toBeInTheDocument();
      // Ajuste: múltiplos "OK" podem aparecer, então use getAllByText
      expect(screen.getAllByText(/OK/i).length).toBeGreaterThan(0);
    });
  });
});

describe('Frontend - SaldosDiariosList', () => {
  it('exibe tabela de saldos diários', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ([{
        data: '2026-02-25', saldo_inicio: 1000, total_creditos: 500, total_debitos: 200, saldo_fim: 1300
      }])
    });
    render(<SaldosDiariosList token="fake-token" />);
    await waitFor(() => {
      expect(screen.getByText('25/02/2026')).toBeInTheDocument();
      expect(screen.getByText('R$ 1.000,00')).toBeInTheDocument();
      expect(screen.getByText('R$ 500,00')).toBeInTheDocument();
      expect(screen.getByText('R$ 200,00')).toBeInTheDocument();
      expect(screen.getByText('R$ 1.300,00')).toBeInTheDocument();
    });
  });
});

describe('Frontend - SaldoDiarioPorData', () => {
  it('exibe saldo diário por data', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: '2026-02-25', saldo_inicio: 1000, total_creditos: 500, total_debitos: 200, saldo_fim: 1300
      })
    });
    render(<SaldoDiarioPorData token="fake-token" />);
    fireEvent.change(screen.getByLabelText(/data/i), { target: { value: '2026-02-25' } });
    fireEvent.click(screen.getByText(/buscar/i));
    await waitFor(() => {
      expect(screen.getByText('25/02/2026')).toBeInTheDocument();
      expect(screen.getByText('R$ 1.000,00')).toBeInTheDocument();
      expect(screen.getByText('R$ 500,00')).toBeInTheDocument();
      expect(screen.getByText('R$ 200,00')).toBeInTheDocument();
      expect(screen.getByText('R$ 1.300,00')).toBeInTheDocument();
    });
  });
});
