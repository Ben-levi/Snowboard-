import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import RideApp from './RideApp.jsx';
import './ride.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RideApp />
  </StrictMode>,
);
