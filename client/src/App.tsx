import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { RequireAuth } from './auth/AuthProvider'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { DocumentRoom } from './components/DocumentRoom'

function RoomRoute() {
  const { docId } = useParams<{ docId: string }>()
  if (!docId) return <Navigate to="/" replace />
  // Remount the whole room when the document id changes.
  return <DocumentRoom key={docId} docId={docId} />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        }
      />
      <Route
        path="/doc/:docId"
        element={
          <RequireAuth>
            <RoomRoute />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
