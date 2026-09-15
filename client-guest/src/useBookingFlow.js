import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from './api.js';
import { DEFAULT_LANG, STRINGS } from './i18n.js';
import { MIN_BOOKING_MINUTES, MAX_BOOKING_MINUTES } from 'salon-shared/booking';

const INITIAL_FLOW_STATE = {
  step: 'landing',
  selectedCategoryId: null,
  // A visit can cover several zones, from several treatments — underarms and
  // full legs and an upper lip, booked as one appointment. The basket is the
  // ids in the order they were tapped.
  selectedServiceIds: [],
  // Chosen lengths for the zones priced by the hour, keyed by service id, in
  // minutes on the same 30-minute grid the slots use. A fixed-price zone is
  // never in here. Named apart from the salon's opening `hours`, which this
  // hook also returns.
  hourlyMinutes: {},
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
  const [profile, setProfile] = useState(null);
  const [categories, setCategories] = useState([]);
  const [hours, setHours] = useState([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [catalogueError, setCatalogueError] = useState(false);
  const [flow, setFlow] = useState(INITIAL_FLOW_STATE);

  const T = STRINGS[lang];

  // The landing page's three fetches go out together, and the price lists
  // arrive nested inside the categories — so the whole guest catalogue is
  // loaded once, up front, and picking a treatment needs no further request.
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([api.getProfile(), api.getCategories(), api.getHours()])
      .then(([profileResult, categoriesResult, hoursResult]) => {
        if (cancelled) return;
        if (profileResult.status === 'fulfilled') setProfile(profileResult.value);
        if (hoursResult.status === 'fulfilled') setHours(hoursResult.value);
        // Profile and hours are decoration — the page still works without
        // them. The treatments are the page's whole point, so only that one
        // failing is worth telling the guest about.
        if (categoriesResult.status === 'fulfilled') {
          setCategories(categoriesResult.value);
        } else {
          setCatalogueError(true);
        }
        setServicesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Flat view of every bookable zone, for the screens that only ever look a
  // service up by id (calendar, confirmation, manage).
  const services = useMemo(() => categories.flatMap((c) => c.services), [categories]);
  const servicesById = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const selectedCategory =
    categories.find((c) => c.id === flow.selectedCategoryId) ?? null;

  // What the basket adds up to. An hourly zone contributes the length chosen
  // for it, priced pro rata; a fixed zone contributes its own two numbers.
  const basket = useMemo(() => {
    const zones = flow.selectedServiceIds
      .map((id) => servicesById.get(id))
      .filter(Boolean)
      .map((service) => {
        const minutes = service.is_hourly
          ? flow.hourlyMinutes[service.id] ?? MIN_BOOKING_MINUTES
          : service.duration_minutes;
        const price = service.is_hourly
          ? Math.round((service.price_amd * minutes) / 60)
          : service.price_amd;
        return { service, minutes, price };
      });
    return {
      zones,
      minutes: zones.reduce((sum, z) => sum + z.minutes, 0),
      price: zones.reduce((sum, z) => sum + z.price, 0),
      hasHourly: zones.some((z) => z.service.is_hourly),
    };
  }, [flow.selectedServiceIds, flow.hourlyMinutes, servicesById]);

  const patch = (fields) => setFlow((prev) => ({ ...prev, ...fields }));

  // Changing the length on the calendar screen re-asks for slots, and a tap can
  // land before the previous answer does. Only the newest request may write its
  // result, or a slower earlier response would overwrite a newer one.
  const slotRequestRef = useRef(0);
  // What the calendar's current slot list was built for, so it is refetched
  // when the length changes and not on every unrelated re-render.
  const loadedForRef = useRef(null);

  // The chosen length changes which start times leave enough room, so it is
  // part of the slot request rather than something applied afterwards.
  // `keepDay` is for reloads that happen while the guest is already looking at
  // a particular day — the day stays put, only the times below it change.
  async function loadSlots({ excludeBookingId, durationMinutes, keepDay } = {}) {
    const requestId = slotRequestRef.current + 1;
    slotRequestRef.current = requestId;

    patch({
      slotsLoading: true,
      slotsData: null,
      selectedSlot: null,
      ...(keepDay ? {} : { selectedDayIndex: 0 }),
    });
    try {
      const data = await api.getSlots({ excludeBookingId, durationMinutes });
      if (slotRequestRef.current !== requestId) return;
      patch({ slotsData: data, slotsLoading: false });
    } catch {
      if (slotRequestRef.current !== requestId) return;
      patch({ slotsLoading: false, bannerErrorKey: 'genericError' });
    }
  }

  const setLang = (code) => {
    setLangState(code);
    setLangMenuOpen(false);
  };
  const toggleLangMenu = () => setLangMenuOpen((v) => !v);

  // Tapping a zone adds or removes it. An hourly zone arrives with the shortest
  // length already chosen, so the basket is always complete enough to price.
  const toggleService = (id) =>
    setFlow((prev) => {
      const chosen = prev.selectedServiceIds.includes(id);
      const selectedServiceIds = chosen
        ? prev.selectedServiceIds.filter((x) => x !== id)
        : [...prev.selectedServiceIds, id];
      const hourlyMinutes = { ...prev.hourlyMinutes };
      if (chosen) delete hourlyMinutes[id];
      else if (servicesById.get(id)?.is_hourly) hourlyMinutes[id] = MIN_BOOKING_MINUTES;
      return { ...prev, selectedServiceIds, hourlyMinutes, selectedSlot: null };
    });

  const clearBasket = () => patch({ selectedServiceIds: [], hourlyMinutes: {} });
  // Stepping by a delta off the previous state, not off a value captured when
  // the button rendered: two quick taps on + otherwise both read the same
  // starting length and the second one is lost. Clamping lives here too, so the
  // buttons can't push the length outside what the server will accept.
  const stepMinutes = (serviceId, delta) =>
    setFlow((prev) => {
      const current = prev.hourlyMinutes[serviceId] ?? MIN_BOOKING_MINUTES;
      const next = Math.min(MAX_BOOKING_MINUTES, Math.max(MIN_BOOKING_MINUTES, current + delta));
      if (next === current) return prev;
      return {
        ...prev,
        hourlyMinutes: { ...prev.hourlyMinutes, [serviceId]: next },
        selectedSlot: null,
      };
    });

  // Opening a treatment keeps whatever is already in the basket: that is how a
  // visit comes to span two treatments.
  const selectCategory = (id) =>
    patch({ step: 'services', selectedCategoryId: id, bannerErrorKey: null });
  const backToLanding = () => patch({ step: 'landing' });

  // The calendar's slot list is owned by the effect below rather than fetched
  // here: the guest changes the length *on* that screen, so the list has to
  // follow the length, and one loader avoids the two racing.
  const continueToCalendar = () => {
    loadedForRef.current = null;
    patch({ step: 'calendar', bannerErrorKey: null });
  };
  const backToServices = () => patch({ step: 'services' });

  // Reloads whenever the calendar is opened and whenever the length changes
  // while it's open.
  useEffect(() => {
    if (flow.step !== 'calendar' || basket.minutes === 0) return;
    if (loadedForRef.current === basket.minutes) return;
    const isFirstLoad = loadedForRef.current === null;
    loadedForRef.current = basket.minutes;
    loadSlots({ durationMinutes: basket.minutes, keepDay: !isFirstLoad });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.step, basket.minutes]);

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
    const day = flow.slotsData?.days[flow.selectedDayIndex];
    if (basket.zones.length === 0 || !day || !flow.selectedSlot) return;

    patch({ busy: true, bannerErrorKey: null });
    try {
      const booking = await api.createBooking({
        date: day.date,
        time: flow.selectedSlot,
        customerName: flow.name,
        customerPhone: flow.phone,
        items: basket.zones.map((z) => ({
          serviceId: z.service.id,
          ...(z.service.is_hourly ? { durationMinutes: z.minutes } : {}),
        })),
      });
      patch({
        busy: false,
        step: 'confirmation',
        activeBooking: {
          id: booking.id,
          items: booking.items,
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
        loadSlots({ durationMinutes: basket.minutes, keepDay: true });
      } else {
        patch({ busy: false, bannerErrorKey: 'genericError' });
      }
    }
  }

  function resetToStart() {
    setFlow({ ...INITIAL_FLOW_STATE });
  }
  const bookAnother = () => resetToStart();

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
        items: booking.items,
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
    const booked = flow.activeBooking;
    // Rescheduling keeps the length already booked, so the slot list has to be
    // asked for exactly that — not the zones' nominal durations.
    const minutes = Math.round((new Date(booked.endTime) - new Date(booked.startTime)) / 60000);
    loadSlots({ excludeBookingId: booked.id, durationMinutes: minutes });
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

    profile,
    categories,
    hours,
    services,
    servicesLoading,
    catalogueError,
    ...flow,
    selectedCategory,

    selectCategory,
    backToLanding,
    toggleService,
    clearBasket,
    basket,
    stepMinutes,
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
