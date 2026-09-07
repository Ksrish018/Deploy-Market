import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

// HashRouter, not BrowserRouter: this app needs to work opened straight from
// a file:// URL (the offline single-file build), where a real path like
// /intake can't be pushState'd — only the #hash portion of a file:// URL is
// safe for client-side routing. Works identically when server-hosted too.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
