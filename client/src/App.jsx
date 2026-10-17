import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import MyProfile from './pages/MyProfile';
import CustomerList from './pages/customers/CustomerList';
import CustomerDetail from './pages/customers/CustomerDetail';

// Customers land on their own profile, staff land on the customer list.
const homePath = (user) => (user?.role === 'CUSTOMER' ? '/my' : '/customers');

function Protected({ roles, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homePath(user)} replace />;
  return children;
}

function Landing() {
  const { user } = useAuth();
  return <Navigate to={user ? homePath(user) : '/login'} replace />;
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
      </BrowserRouter>
    </AuthProvider>
  );
}
