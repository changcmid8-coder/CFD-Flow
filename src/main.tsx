import { createRoot } from 'react-dom/client'
import App from './app/App'
import ErrorBoundary from './app/ErrorBoundary'
import '@xyflow/react/dist/style.css'
import './styles/tokens.css'

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
