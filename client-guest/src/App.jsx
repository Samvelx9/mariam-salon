import { useBookingFlow } from './useBookingFlow.js';
import LandingScreen from './components/LandingScreen.jsx';
import ServicesScreen from './components/ServicesScreen.jsx';
import CalendarScreen from './components/CalendarScreen.jsx';
import DetailsScreen from './components/DetailsScreen.jsx';
import ConfirmationScreen from './components/ConfirmationScreen.jsx';
import LookupScreen from './components/LookupScreen.jsx';
import BookingsListScreen from './components/BookingsListScreen.jsx';
import ManageScreen from './components/ManageScreen.jsx';
import ReschedulePickerScreen from './components/ReschedulePickerScreen.jsx';
import CancelConfirmScreen from './components/CancelConfirmScreen.jsx';
import CancelledScreen from './components/CancelledScreen.jsx';

const SCREENS = {
  landing: LandingScreen,
  services: ServicesScreen,
  calendar: CalendarScreen,
  details: DetailsScreen,
  confirmation: ConfirmationScreen,
  lookup: LookupScreen,
  bookingsList: BookingsListScreen,
  manage: ManageScreen,
  reschedulePicker: ReschedulePickerScreen,
  cancelConfirm: CancelConfirmScreen,
  cancelled: CancelledScreen,
};

export default function App() {
  const flow = useBookingFlow();
  const Screen = SCREENS[flow.step] ?? LandingScreen;

  return (
    <div className="app-shell">
      <Screen {...flow} />
    </div>
  );
}
