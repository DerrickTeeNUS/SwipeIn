import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import ProfilePage from './pages/ProfilePage'
import HomePage from './pages/HomePage'
import StudentProfilePage from './pages/StudentProfilePage'
import ProfessionalProfilePage from './pages/ProfessionalProfilePage'
import SwipePage from './pages/SwipePage'
import MessagesPage from './pages/MessagesPage'
import OpportunitiesPage from './pages/OpportunitiesPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/signup" replace />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/student/:uid" element={<StudentProfilePage />} />
        <Route path="/professional/:uid" element={<ProfessionalProfilePage />} />
        <Route path="/swipe" element={<SwipePage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/opportunities" element={<OpportunitiesPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App