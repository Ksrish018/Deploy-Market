import { Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { TopBar } from './components/TopBar';
import Dashboard from './pages/Dashboard';
import Intake from './pages/Intake';
import PrioritiesWeights from './pages/PrioritiesWeights';
import ReviewQueue from './pages/ReviewQueue';
import PriorityQueue from './pages/PriorityQueue';
import Brief from './pages/Brief';
import Archive from './pages/Archive';

export default function App() {
  return (
    <AppProvider>
      <div className="min-h-screen flex flex-col" style={{ background: 'var(--surface-0)' }}>
        <TopBar />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/intake" element={<Intake />} />
            <Route path="/priorities" element={<PrioritiesWeights />} />
            <Route path="/review" element={<ReviewQueue />} />
            <Route path="/queue" element={<PriorityQueue />} />
            <Route path="/brief" element={<Brief />} />
            <Route path="/archive" element={<Archive />} />
          </Routes>
        </main>
      </div>
    </AppProvider>
  );
}
