import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homeFor } from './ProtectedRoute';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => { await logout(); navigate('/login'); };

  return (
    <header className="nav">
      <div className="nav-inner">
        <NavLink to={user ? homeFor(user.role) : '/login'} className="brand">
          <span className="brand-mark">P</span> ParkEasy
        </NavLink>
        <nav className="nav-links">
          {user && <NavLink to="/lots">Find parking</NavLink>}
          {user?.role === 'driver' && <NavLink to="/bookings">My bookings</NavLink>}
          {(user?.role === 'manager' || user?.role === 'admin') && <NavLink to="/manager">Manage lots</NavLink>}
          {user?.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
        </nav>
        <div className="nav-user">
          {user ? (
            <>
              <span className="who">{user.name} <span className="tag">{user.role}</span></span>
              <button className="btn btn-ghost" onClick={handleLogout}>Log out</button>
            </>
          ) : (
            <>
              <NavLink to="/login">Log in</NavLink>
              <NavLink to="/register" className="btn btn-primary">Sign up</NavLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
