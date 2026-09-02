import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'
import './download-dialog.css'
import './completion.css'
import './completed-download.css'
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>)
