import React from 'react';
import {createRoot} from 'react-dom/client';
import App from '../app/page';
import '../app/globals.css';
import {initializeTheme} from '../components/retail/theme-control';
initializeTheme();
createRoot(document.getElementById('root')!).render(<App/>);
