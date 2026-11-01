/**
 * Shell and routes. Selected corridor and train live in the URL, so every
 * view is shareable (section 12).
 */
import { Route, Routes } from 'react-router-dom';
import { MapHome } from '../features/map/MapHome';
import { SearchPage } from '../features/search/SearchPage';
import { TrainDetailPage } from '../features/train-detail/TrainDetailPage';
import { ReplayPage } from '../features/replay/ReplayPage';
import { SharePage } from '../features/share/SharePage';
import { AdminPage } from '../features/admin/AdminPage';
import { AboutPage } from '../features/about/AboutPage';
import { TabBar } from '../components/TabBar';

export function App() {
  return (
    <div className="rp-app">
      <a className="rp-skip-link" href="#main">
        Skip to content
      </a>
      <main id="main" style={{ flex: 1, minHeight: 0, display: 'flex', position: 'relative' }}>
        <Routes>
          <Route path="/" element={<MapHome />} />
          <Route path="/corridors/:slug" element={<MapHome />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/trains/:number" element={<TrainDetailPage />} />
          <Route path="/replay" element={<ReplayPage />} />
          <Route path="/share/:code" element={<SharePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/about" element={<AboutPage />} />
        </Routes>
      </main>
      <TabBar />
    </div>
  );
}
