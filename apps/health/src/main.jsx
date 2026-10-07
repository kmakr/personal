import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import PublicApp from './PublicApp';
import './style.css';
import './ink-mark.js';

const Dashboard = import.meta.env.VITE_PUBLIC_DASHBOARD === 'true' ? PublicApp : App;
createRoot(document.getElementById('root')).render(<Dashboard />);
