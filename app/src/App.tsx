import { Routes, Route } from 'react-router'
import Lobby from './pages/Lobby'
import Game from './pages/Game'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Lobby />} />
      <Route path="/game" element={<Game />} />
    </Routes>
  )
}
