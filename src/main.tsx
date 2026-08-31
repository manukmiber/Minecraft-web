import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import './index.css'
import { installBuiltinKinds } from './core/kinds'

// The registry has to be populated before the first generation pass, which
// happens as soon as the project store is created.
installBuiltinKinds()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
