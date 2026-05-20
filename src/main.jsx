import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { IS_APP_HOST } from './lib/appUrl'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={IS_APP_HOST ? '/' : '/ng'}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
