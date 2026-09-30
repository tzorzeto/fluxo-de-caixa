import React from 'react';
import { createRoot } from 'react-dom/client';
import AppLancamentos from './components/AppLancamentos';

const container = document.getElementById('root');
const root = createRoot(container);
root.render(<AppLancamentos />);
