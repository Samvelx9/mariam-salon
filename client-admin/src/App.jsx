import { useState } from 'react';
import { DEFAULT_LANG, STRINGS } from './i18n.js';
import { useAdminAuth } from './useAdminAuth.js';
import LoginScreen from './components/LoginScreen.jsx';
import AdminLayout from './components/AdminLayout.jsx';
import DashboardScreen from './components/DashboardScreen.jsx';
import BookingsScreen from './components/BookingsScreen.jsx';
import ServicesScreen from './components/ServicesScreen.jsx';
import AvailabilityScreen from './components/AvailabilityScreen.jsx';
import ProfileScreen from './components/ProfileScreen.jsx';
import CategoriesScreen from './components/CategoriesScreen.jsx';

const SCREENS = {
  dashboard: DashboardScreen,
  bookings: BookingsScreen,
  categories: CategoriesScreen,
  services: ServicesScreen,
  availability: AvailabilityScreen,
  profile: ProfileScreen,
};

export default function App() {
  const [lang, setLang] = useState(DEFAULT_LANG);
  const [tab, setTab] = useState('dashboard');
  const auth = useAdminAuth();
  const T = STRINGS[lang];

  if (!auth.loggedIn) {
    return (
      <LoginScreen
        T={T}
        lang={lang}
        setLang={setLang}
        login={auth.login}
        loginError={auth.loginError}
        loggingIn={auth.loggingIn}
      />
    );
  }

  const Screen = SCREENS[tab];

  return (
    <AdminLayout T={T} lang={lang} setLang={setLang} tab={tab} setTab={setTab} onLogout={auth.logout}>
      <Screen T={T} lang={lang} onAuthError={auth.handleAuthError} />
    </AdminLayout>
  );
}
