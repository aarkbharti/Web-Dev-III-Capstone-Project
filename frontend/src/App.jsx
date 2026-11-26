import { Routes, Route, Navigate, Link } from 'react-router-dom';
import Navbar from './components/Navbar';
import ProtectedRoute, { homeFor } from './components/ProtectedRoute';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Lots from './pages/Lots';
import LotDetail from './pages/LotDetail';
import MyBookings from './pages/MyBookings';
import Manager from './pages/Manager';
import Admin from './pages/Admin';

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <p className="center muted">Loading...</p>;
  return <Navigate to={user ? homeFor(user.role) : '/login'} replace />;
}

const NotFound = () => (
  <div className="page center">
    <h1>Page not found</h1>
    <p className="muted">The page you are looking for does not exist.</p>
    <Link className="btn btn-primary" to="/">Go home</Link>
  </div>
);

export default function App() {
  return (
    <>
      <Navbar />
      <main className="page">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/lots" element={<Lots />} />
            <Route path="/lots/:id" element={<LotDetail />} />
          </Route>
          <Route element={<ProtectedRoute roles={['driver']} />}>
            <Route path="/bookings" element={<MyBookings />} />
          </Route>
          <Route element={<ProtectedRoute roles={['manager', 'admin']} />}>
            <Route path="/manager" element={<Manager />} />
          </Route>
          <Route element={<ProtectedRoute roles={['admin']} />}>
            <Route path="/admin" element={<Admin />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </>
  );
}
