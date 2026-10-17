import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { homePath } from './context/session';
import SessionLoader from './components/SessionLoader';
import Layout from './components/Layout';
import Login from './pages/Login';
import MyProfile from './pages/MyProfile';
import CustomerList from './pages/customers/CustomerList';
import CustomerDetail from './pages/customers/CustomerDetail';

function Protected({ roles, children }) {
  const { user, status } = useAuth();
  // wait for the stored session to be validated before deciding anything
  if (status === 'checking') return <SessionLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homePath(user)} replace />;
  return children;
}

function Landing() {
  const { user, status } = useAuth();
  if (status === 'checking') return <SessionLoader />;
  return <Navigate to={user ? homePath(user) : '/login'} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <Protected>
                <Layout />
              </Protected>
            }
          >
            <Route path="/my" element={<MyProfile />} />
            <Route
              path="/customers"
              element={
                <Protected roles={['ADMIN', 'AGENT']}>
                  <CustomerList />
                </Protected>
              }
            />
            <Route path="/customers/:id" element={<CustomerDetail />} />
          </Route>
          <Route path="*" element={<Landing />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
