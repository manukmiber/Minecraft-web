import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'framer-motion'

import App from './App'
import './index.css'
import { installBuiltinKinds } from './core/kinds'

// The registry has to be populated before the first generation pass, which
// happens as soon as the project store is created.
installBuiltinKinds()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/*
      `reducedMotion="user"` makes every Framer Motion animation in the app
      follow the OS setting: transforms and opacity stop animating, while
      layout still lands in the right place. The CSS side of the same rule
      lives in index.css.
    */}
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
)
