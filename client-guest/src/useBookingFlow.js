import { useEffect, useState } from 'react';
import { api, ApiError } from './api.js';
import { DEFAULT_LANG, STRINGS } from './i18n.js';

const INITIAL_FLOW_STATE = {
  step: 'services',
  selectedServiceId: null,
  slotsData: null,
  slotsLoading: false,
  selectedDayIndex: 0,
  selectedSlot: null,
  name: '',
  phone: '',
  formError: false,
  lookupPhone: '',
  lookupError: false,
  bookings: [],
  activeBooking: null,
  manageOrigin: null,
  bannerErrorKey: null,
  busy: false,
};

function errorKeyFor(err) {
  if (err instanceof ApiError && (err.code === 'slot_taken' || err.code === 'too_soon')) {
    return err.code === 'slot_taken' ? 'slotTaken' : 'tooSoon';
  }
  return 'genericError';
}

export function useBookingFlow() {
  const [lang, setLangState] = useState(DEFAULT_LANG);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [services, setServices] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [flow, setFlow] = useState(INITIAL_FLOW_STATE);

  const T = STRINGS[lang];

  useEffect(() => {
    let cancelled = false;
    api
      .getServices()
      .then((data) => {
        if (!cancelled) setServices(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setServicesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const patch = (fields) => setFlow((prev) => ({ ...prev, ...fields }));

  async function loadSlots(serviceId, { excludeBookingId } = {}) {
    patch({ slotsLoading: true, slotsData: null, selectedDayIndex: 0, selectedSlot: null });
    try {
      const data = await api.getSlots(serviceId, { excludeBookingId });
      patch({ slotsData: data, slotsLoading: false });
    } catch {
      patch({ slotsLoading: false, bannerErrorKey: 'genericError' });
    }
  }

  const setLang = (code) => {
    setLangState(code);
    setLangMenuOpen(false);
  };
  const toggleLangMenu = () => setLangMenuOpen((v) => !v);

  const selectService = (id) => patch({ selectedServiceId: id });

  const continueToCalendar = () => {
    patch({ step: 'calendar', bannerErrorKey: null });
    loadSlots(flow.selectedServiceId);
  };
  const backToServices = () => patch({ step: 'services' });

  const selectDay = (index) => patch({ selectedDayIndex: index, selectedSlot: null });
  const selectSlot = (time) => patch({ selectedSlot: time });

  const continueToDetails = () => patch({ step: 'details', bannerErrorKey: null });
  const backToCalendar = () => patch({ step: 'calendar' });

  const onNameChange = (value) => patch({ name: value, formError: false });
  const onPhoneChange = (value) => patch({ phone: value, formError: false });

  async function confirmBooking() {
    if (!flow.name.trim() || !flow.phone.trim()) {
      patch({ formError: true });
      return;
    }
    const service = services.find((s) => s.id === flow.selectedServiceId);
    const day = flow.slotsData?.days[flow.selectedDayIndex];
    if (!service || !day || !flow.selectedSlot) return;

    patch({ busy: true, bannerErrorKey: null });
    try {
      const booking = await api.createBooking({
        serviceId: service.id,
        date: day.date,
        time: flow.selectedSlot,
        customerName: flow.name,
        customerPhone: flow.phone,
      });
      patch({
        busy: false,
        step: 'confirmation',
        activeBooking: {
          id: booking.id,
          serviceId: service.id,
          name_en: service.name_en,
          name_ru: service.name_ru,
          name_hy: service.name_hy,
          startTime: booking.startTime,
          endTime: booking.endTime,
          status: booking.status,
          customerName: booking.customerName,
          customerPhone: booking.customerPhone,
          priceAtBooking: booking.priceAtBooking,
        },
      });
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'slot_taken' || err.code === 'too_soon')) {
        patch({ busy: false, step: 'calendar', selectedSlot: null, bannerErrorKey: errorKeyFor(err) });
        loadSlots(service.id);
      } else {
        patch({ busy: false, bannerErrorKey: 'genericError' });
      }
    }
  }

  function resetToServices() {
    setFlow({ ...INITIAL_FLOW_STATE });
  }
  const bookAnother = () => resetToServices();

  const goToLookup = () =>
    patch({ step: 'lookup', lookupPhone: '', lookupError: false, bannerErrorKey: null });
  const onLookupPhoneChange = (value) => patch({ lookupPhone: value, lookupError: false });

  async function findBooking() {
    if (!flow.lookupPhone.trim()) {
      patch({ lookupError: true });
      return;
    }
    patch({ busy: true, bannerErrorKey: null });
    try {
      const bookings = await api.lookupBookings(flow.lookupPhone);
      patch({ busy: false, bookings, step: 'bookingsList' });
    } catch {
      patch({ busy: false, bannerErrorKey: 'genericError' });
    }
  }

  const backToLookup = () => patch({ step: 'lookup' });
  const backToBookingsList = () => patch({ step: 'bookingsList' });

  const pickBooking = (booking) => {
    patch({
      step: 'manage',
      activeBooking: {
        id: booking.id,
        serviceId: booking.service_id,
        name_en: booking.name_en,
        name_ru: booking.name_ru,
        name_hy: booking.name_hy,
        startTime: booking.start_time,
        endTime: booking.end_time,
        status: booking.status,
        customerName: booking.customer_name,
        customerPhone: flow.lookupPhone,
        priceAtBooking: booking.price_at_booking,
      },
    });
  };

  function goReschedule(origin) {
    patch({ step: 'reschedulePicker', manageOrigin: origin, bannerErrorKey: null });
    loadSlots(flow.activeBooking.serviceId, { excludeBookingId: flow.activeBooking.id });
  }
  const goRescheduleFromConfirmation = () => goReschedule('confirmation');
  const goRescheduleFromManage = () => goReschedule('manage');

  const goCancelFromConfirmation = () =>
    patch({ step: 'cancelConfirm', manageOrigin: 'confirmation', bannerErrorKey: null });
  const goCancelFromManage = () =>
    patch({ step: 'cancelConfirm', manageOrigin: 'manage', bannerErrorKey: null });

  const backFromSubflow = () =>
    patch({ step: flow.manageOrigin === 'manage' ? 'manage' : 'confirmation', bannerErrorKey: null });

  async function confirmNewTime() {
    const day = flow.slotsData?.days[flow.selectedDayIndex];
    if (!day || !flow.selectedSlot || !flow.activeBooking) return;

    patch({ busy: true, bannerErrorKey: null });
    try {
      const updated = await api.rescheduleBooking(flow.activeBooking.id, {
        date: day.date,
        time: flow.selectedSlot,
      });
      patch({
        busy: false,
        step: flow.manageOrigin === 'manage' ? 'manage' : 'confirmation',
        activeBooking: {
          ...flow.activeBooking,
          startTime: updated.start_time,
          endTime: updated.end_time,
          status: updated.status,
        },
      });
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'slot_taken' || err.code === 'too_soon')) {
        patch({ busy: false, selectedSlot: null, bannerErrorKey: errorKeyFor(err) });
        loadSlots(flow.activeBooking.serviceId, { excludeBookingId: flow.activeBooking.id });
      } else {
        patch({ busy: false, bannerErrorKey: 'genericError' });
      }
    }
  }

  async function finalizeCancel() {
    patch({ busy: true, bannerErrorKey: null });
    try {
      await api.cancelBooking(flow.activeBooking.id);
      patch({ busy: false, step: 'cancelled' });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'already_cancelled') {
        patch({ busy: false, step: 'cancelled' });
      } else {
        patch({ busy: false, bannerErrorKey: 'genericError' });
      }
    }
  }

  return {
    lang,
    setLang,
    langMenuOpen,
    toggleLangMenu,
    T,

    services,
    servicesLoading,
    ...flow,

    selectService,
    continueToCalendar,
    backToServices,
    selectDay,
    selectSlot,
    continueToDetails,
    backToCalendar,
    onNameChange,
    onPhoneChange,
    confirmBooking,
    bookAnother,
    goToLookup,
    onLookupPhoneChange,
    findBooking,
    backToLookup,
    backToBookingsList,
    pickBooking,
    goRescheduleFromConfirmation,
    goRescheduleFromManage,
    goCancelFromConfirmation,
    goCancelFromManage,
    backFromSubflow,
    confirmNewTime,
    finalizeCancel,
  };
}
