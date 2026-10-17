import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import CustomerList from './pages/customers/CustomerList';
import CustomerDetail from './pages/customers/CustomerDetail';

function Protected({ roles, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <Protected>
                <Layout />
              </Protected>
            }
          >
            <Route
              path="/customers"
              element={<Protected roles={['ADMIN', 'AGENT']}><CustomerList /></Protected>}
            />
            <Route
              path="/customers/:id"
              element={<CustomerDetail />}
            />
          </Route>
          <Route path="*" element={<Navigate to="/customers" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
