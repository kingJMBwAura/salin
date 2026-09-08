import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {/* Hash routing, not path routing: the renderer is loaded from file:// in
        the packaged app, where path routes 404 on reload. */}
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
)
