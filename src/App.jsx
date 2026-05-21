import { Routes, Route, Navigate } from 'react-router-dom'
import SignupPage from './pages/SignupPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/signup" replace />} />
      <Route path="/signup" element={<SignupPage />} />
    </Routes>
  )
}

export default App
