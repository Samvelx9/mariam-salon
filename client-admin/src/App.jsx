import { useEffect, useState } from 'react';
import { DEFAULT_LANG, STRINGS } from './i18n.js';
import { useAdminAuth } from './useAdminAuth.js';
import { goToTab, readRoute } from './route.js';
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

const LANG_STORAGE_KEY = 'admin_lang';

// A missing or unknown tab in the URL (a first visit to /admin/, an old link) is
// rewritten to the dashboard straight away, so the screen's own state always
// has a tab to sit under.
function tabFromUrl() {
  const { tab } = readRoute();
  if (SCREENS[tab]) return tab;
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#dashboard`);
  return 'dashboard';
}

function storedLang() {
  try {
    const value = localStorage.getItem(LANG_STORAGE_KEY);
    return value && STRINGS[value] ? value : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

export default function App() {
  const [lang, setLangState] = useState(storedLang);

  // Screen readers pick a voice, and browsers decide whether to offer
  // translation, from <html lang> — so it follows the language on screen
  // rather than staying at index.html's "en".
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const [tab, setTabState] = useState(tabFromUrl);
  const auth = useAdminAuth();

  // Back / Forward between tabs.
  useEffect(() => {
    const onPopState = () => setTabState(tabFromUrl());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const setTab = (next) => {
    if (next === tab) return;
    goToTab(next);
    setTabState(next);
  };

  const setLang = (next) => {
    setLangState(next);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // Private mode or blocked storage: the language just won't survive a reload.
    }
  };
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
