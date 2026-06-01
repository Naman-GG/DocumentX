import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { v4 as uuidv4 } from 'uuid'
import { DocumentRoom } from './components/DocumentRoom'

function RoomRoute() {
  const { roomId } = useParams<{ roomId: string }>()
  if (!roomId) return <Navigate to="/" replace />
  // Remount the whole room when the room id changes.
  return <DocumentRoom key={roomId} roomId={roomId} />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={`/doc/${uuidv4()}`} replace />} />
      <Route path="/doc/:roomId" element={<RoomRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
