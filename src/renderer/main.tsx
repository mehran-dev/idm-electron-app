import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'
import './download-dialog.css'
import './completion.css'
import './completed-download.css'
import './sorting.css'
import './segmented-progress.css'
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
