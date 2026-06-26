import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

// Layouts
import AppLayout      from '@/components/layout/AppLayout';
import AuthLayout     from '@/components/layout/AuthLayout';

// Auth pages
import LandingPage      from '@/pages/LandingPage';
import LoginPage        from '@/pages/auth/LoginPage';
import RegisterPage     from '@/pages/auth/RegisterPage';
import VerifyEmailPage  from '@/pages/auth/VerifyEmailPage';

// Student pages
import StudentDashboard    from '@/pages/student/StudentDashboard';
import AssessmentPage      from '@/pages/student/AssessmentPage';
import AssessmentResults   from '@/pages/student/AssessmentResults';
import MyReports           from '@/pages/student/MyReports';
import ReportPage          from '@/pages/shared/ReportPage';

// Psychologist pages
import PsychologistDashboard from '@/pages/psychologist/PsychologistDashboard';
import StudentsList          from '@/pages/psychologist/StudentsList';

// Shared pages
import PermissionsPage from '@/pages/shared/PermissionsPage';
import ProfilePage     from '@/pages/shared/ProfilePage';
import SettingsPage    from '@/pages/shared/SettingsPage';
import NotFoundPage    from '@/pages/NotFoundPage';

// Guards
function PrivateRoute({ children, roles }) {
  const { user, isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user?.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { isAuthenticated } = useAuthStore();
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return children;
}

function DashboardRedirect() {
  const { user } = useAuthStore();
  if (user?.role === 'psychologist') return <Navigate to="/psychologist/dashboard" replace />;
  if (user?.role === 'admin')        return <Navigate to="/psychologist/dashboard" replace />;
  return <Navigate to="/student/dashboard" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login"         element={<PublicRoute><AuthLayout><LoginPage /></AuthLayout></PublicRoute>} />
        <Route path="/register"      element={<PublicRoute><AuthLayout><RegisterPage /></AuthLayout></PublicRoute>} />
        <Route path="/verify-email"  element={<AuthLayout><VerifyEmailPage /></AuthLayout>} />

        {/* Dashboard redirect */}
        <Route path="/dashboard" element={<PrivateRoute><DashboardRedirect /></PrivateRoute>} />

        {/* Student routes */}
        <Route path="/student" element={<PrivateRoute roles={['student']}><AppLayout /></PrivateRoute>}>
          <Route path="dashboard"   element={<StudentDashboard />} />
          <Route path="assessment"  element={<AssessmentPage />} />
          <Route path="assessment/:id/results" element={<AssessmentResults />} />
          <Route path="reports"     element={<MyReports />} />
          <Route path="reports/:id" element={<ReportPage />} />
          <Route path="permissions" element={<PermissionsPage />} />
          <Route path="profile"     element={<ProfilePage />} />
          <Route path="settings"    element={<SettingsPage />} />
        </Route>

        {/* Psychologist routes */}
        <Route path="/psychologist" element={<PrivateRoute roles={['psychologist','admin']}><AppLayout /></PrivateRoute>}>
          <Route path="dashboard"   element={<PsychologistDashboard />} />
          <Route path="students"    element={<StudentsList />} />
          <Route path="reports/:id" element={<ReportPage />} />
          <Route path="profile"     element={<ProfilePage />} />
          <Route path="settings"    element={<SettingsPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
