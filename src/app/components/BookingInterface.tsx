import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Calendar as CalendarIcon, Trash2 } from 'lucide-react';
import { addMinutes, format, isSameDay } from 'date-fns';
import { toast } from 'sonner';
import { useApp } from '@/context/AppContext';
import { backendApi } from '@/context/backendApi';

type BookingType = 'private' | 'open_play' | 'training';

type BookingRow = {
  id: string;
  courtId: string;
  date: string;
  startTime: string;
  duration: number;
  type: BookingType;
};

type BookingDraft = {
  courtId: string;
  type: BookingType;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  amount: number;
  bookingHoldId?: string;
};

type BookingInterfaceProps = {
  initialMode?: 'standard' | 'quick';
  quickOnly?: boolean;
};

const COURT_SPORT: Record<string, string> = {
  c1: 'Basketball',
  c2: 'Tennis',
  c3: 'Pickle Ball',
};


const toTimeLabel = (minutes: number) => {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  return `${(minutes / 60).toFixed(1).replace(/\.0$/, '')} hours`;
};

const formatHHmm = (date: Date) => format(date, 'HH:mm');
const format12Time = (value: string) => {
  const [h, m] = value.split(':').map(Number);
  const d = new Date(2000, 0, 1, h, m, 0, 0);
  return format(d, 'h:mm a');
};
const toMinutes = (value: string) => {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
};
const fromMinutes = (minutes: number) => {
  const safe = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh = String(Math.floor(safe / 60)).padStart(2, '0');
  const mm = String(safe % 60).padStart(2, '0');
  return `${hh}:${mm}`;
};
const addMinutesToTime = (value: string, deltaMinutes: number) => fromMinutes(toMinutes(value) + deltaMinutes);

const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => {
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd);
};

export function BookingInterface({ initialMode = 'standard', quickOnly = false }: BookingInterfaceProps = {}) {
  const { currentUser, courts, config, getAvailableSlots, createBooking, systemSetup, bookings } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const prefillCourtId = (location.state as { prefillCourtId?: string } | null)?.prefillCourtId;

  const defaultCourtId = prefillCourtId || courts.find((c) => c.status === 'active')?.id || '';
  const [bookingMode, setBookingMode] = useState<'standard' | 'quick'>(() => (quickOnly ? 'quick' : initialMode));
  const [name, setName] = useState(currentUser?.name || '');
  const [selectedCourtId, setSelectedCourtId] = useState(defaultCourtId);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [duration, setDuration] = useState(config.bookingInterval || 60);
  const [bookingType, setBookingType] = useState<BookingType>('private');
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [unavailableByRowId, setUnavailableByRowId] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!selectedCourtId && defaultCourtId) {
      setSelectedCourtId(defaultCourtId);
    }
  }, [defaultCourtId, selectedCourtId]);

  const selectedCourt = useMemo(() => courts.find((c) => c.id === selectedCourtId), [courts, selectedCourtId]);
  const usingBackendApi = backendApi.isEnabled;

  const [quickFullName, setQuickFullName] = useState('');
  const [quickContactNumber, setQuickContactNumber] = useState('');
  const [quickCourtId, setQuickCourtId] = useState(defaultCourtId);
  const [quickDate, setQuickDate] = useState('');
  const [quickTime, setQuickTime] = useState('');
  const quickBookingStep = Math.max(15, config.bookingInterval || 60);
  const quickMaxDuration = Math.max(quickBookingStep, config.maxBookingDuration || 120);
  const [quickDuration, setQuickDuration] = useState(() => Math.min(60, quickMaxDuration));

  useEffect(() => {
    if (!quickCourtId && defaultCourtId) {
      setQuickCourtId(defaultCourtId);
    }
  }, [defaultCourtId, quickCourtId]);
  const [quickAvailableSlots, setQuickAvailableSlots] = useState<string[] | null>(null);
  const [quickLoadingSlots, setQuickLoadingSlots] = useState(false);
  const [quickSubmitting, setQuickSubmitting] = useState(false);
  const [quickSuccess, setQuickSuccess] = useState(false);

  const timeOptions = useMemo(() => {
    const step = config.bookingInterval || 30;
    const options: string[] = [];
    for (let mins = 0; mins < 24 * 60; mins += step) {
      const hh = String(Math.floor(mins / 60)).padStart(2, '0');
      const mm = String(mins % 60).padStart(2, '0');
      options.push(`${hh}:${mm}`);
    }
    return options;
  }, [config.bookingInterval]);

  const hourlyTimeOptions = useMemo(() => {
    const open = selectedCourt ? toMinutes(selectedCourt.operatingHours.start) : 0;
    const close = selectedCourt ? toMinutes(selectedCourt.operatingHours.end) : 24 * 60;
    const start = Math.ceil(open / 60) * 60;
    const options: string[] = [];

    for (let mins = start; mins < close; mins += 60) {
      options.push(fromMinutes(mins));
    }

    return options;
  }, [selectedCourt]);

  const quickTimeOptions = useMemo(() => {
    const court = courts.find((c) => c.id === quickCourtId);
    if (!court) return [];
    const open = toMinutes(court.operatingHours.start);
    const close = toMinutes(court.operatingHours.end);
    return timeOptions.filter((time) => {
      const mins = toMinutes(time);
      return mins >= open && mins < close;
    });
  }, [courts, quickCourtId, timeOptions]);

  useEffect(() => {
    if (selectedTime && !hourlyTimeOptions.includes(selectedTime)) {
      setSelectedTime('');
    }
  }, [hourlyTimeOptions, selectedTime]);

  const rateForTime = (courtId: string, startTime: string) => {
    const court = courts.find((c) => c.id === courtId);
    if (!court) return 0;
    const isPeak = config.peakHours.some((peak) => startTime >= peak.start && startTime < peak.end);
    return isPeak && court.peakHourRate ? court.peakHourRate : court.hourlyRate;
  };

  const computeEndTime = (startTime: string, minutes: number) => {
    const [hours, mins] = startTime.split(':').map(Number);
    const startDate = new Date(2000, 0, 1, hours, mins);
    return formatHHmm(addMinutes(startDate, minutes));
  };

  const selectedRangeEndTime = useMemo(
    () => (selectedTime && duration > 0 ? computeEndTime(selectedTime, duration) : ''),
    [selectedTime, duration],
  );

  const toDraft = (row: BookingRow): BookingDraft => {
    const endTime = computeEndTime(row.startTime, row.duration);
    const hourly = rateForTime(row.courtId, row.startTime);
    return {
      courtId: row.courtId,
      type: row.type,
      date: new Date(`${row.date}T00:00:00`).toISOString(),
      startTime: row.startTime,
      endTime,
      duration: row.duration,
      amount: (hourly * row.duration) / 60,
    };
  };

  const totalPrice = useMemo(
    () => rows.reduce((sum, row) => sum + toDraft(row).amount, 0),
    [rows, courts, config.peakHours],
  );

  const clearRowStatus = (rowId: string) => {
    setUnavailableByRowId((prev) => {
      if (!(rowId in prev)) return prev;
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
  };

  const handleAddRow = () => {
    if (!selectedCourt) {
      toast.error('Please select a court.');
      return;
    }
    if (!selectedDate) {
      toast.error('Please select a date.');
      return;
    }
    if (!selectedTime) {
      toast.error('Please select a start time.');
      return;
    }
    if (!duration || duration <= 0) {
      toast.error('Please enter a valid duration.');
      return;
    }

    const endTime = computeEndTime(selectedTime, duration);
    const hasLocalOverlap = rows.some((row) => {
      if (row.courtId !== selectedCourt.id || row.date !== selectedDate) return false;
      const rowEnd = computeEndTime(row.startTime, row.duration);
      return overlaps(row.startTime, rowEnd, selectedTime, endTime);
    });
    if (hasLocalOverlap) {
      toast.error('This court already has an overlapping slot in your selection.');
      return;
    }

    const rowId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const nextRow: BookingRow = {
      id: rowId,
      courtId: selectedCourt.id,
      date: selectedDate,
      startTime: selectedTime,
      duration,
      type: bookingType,
    };
    setRows((prev) => [...prev, nextRow]);
    clearRowStatus(rowId);
    setSelectedTime('');
  };

  const handleRemoveRow = (rowId: string) => {
    setRows((prev) => prev.filter((row) => row.id !== rowId));
    clearRowStatus(rowId);
  };

  const handleProceed = async () => {
    if (!currentUser) {
      toast.error('Please sign in to continue.');
      return;
    }
    if (!name.trim()) {
      toast.error('Please enter your name.');
      return;
    }
    if (rows.length === 0) {
      toast.error('Please add at least one court slot.');
      return;
    }

    const drafts = rows.map(toDraft);
    const unavailable: Record<string, string> = {};

    if (usingBackendApi) {
      const heldDrafts: BookingDraft[] = [];
      try {
        for (let idx = 0; idx < rows.length; idx += 1) {
          const row = rows[idx];
          const draft = drafts[idx];
          const hold = await backendApi.createBookingHold({
            courtId: draft.courtId,
            date: format(new Date(draft.date), 'yyyy-MM-dd'),
            startTime: draft.startTime,
            endTime: draft.endTime,
            ttlMinutes: 10,
          });
          heldDrafts.push({ ...draft, bookingHoldId: String(hold?.id || '') });
        }
        navigate('/booking/payment', {
          state: { bookingDrafts: heldDrafts },
        });
        return;
      } catch (error: any) {
        for (const holdDraft of heldDrafts) {
          if (holdDraft.bookingHoldId) {
            try {
              await backendApi.releaseBookingHold(holdDraft.bookingHoldId);
            } catch {
              // ignore release failures
            }
          }
        }

        const failedIndex = heldDrafts.length;
        const failedRow = rows[failedIndex];
        if (failedRow) {
          const failedCourt = courts.find((c) => c.id === failedRow.courtId);
          unavailable[failedRow.id] =
            error?.message || `${failedCourt?.name || 'Selected court'} slot is unavailable. Choose another time.`;
          setUnavailableByRowId((prev) => ({ ...prev, ...unavailable }));
          toast.error(
            `${failedCourt?.name || 'Selected court'} (${failedRow.date} ${failedRow.startTime}) is unavailable. Please choose another slot for that court.`,
          );
          return;
        }
        toast.error(error?.message || 'One or more selected slots are unavailable.');
        return;
      }
    }

    for (let idx = 0; idx < rows.length; idx += 1) {
      const row = rows[idx];
      const draft = drafts[idx];
      const availableSlots = await getAvailableSlots(draft.courtId, new Date(draft.date), draft.type);
      if (!availableSlots.includes(draft.startTime)) {
        const failedCourt = courts.find((c) => c.id === row.courtId);
        unavailable[row.id] = `${failedCourt?.name || 'Selected court'} slot is unavailable.`;
      }
    }

    if (Object.keys(unavailable).length > 0) {
      setUnavailableByRowId((prev) => ({ ...prev, ...unavailable }));
      toast.error('Some selected slots are unavailable. Update the highlighted slots.');
      return;
    }

    navigate('/booking/payment', {
      state: { bookingDrafts: drafts },
    });
  };

  useEffect(() => {
    if (bookingMode !== 'quick') return;
    setQuickSuccess(false);
    if (!quickCourtId || !quickDate) {
      setQuickAvailableSlots(null);
      return;
    }

    let cancelled = false;
    setQuickAvailableSlots(null);
    setQuickLoadingSlots(true);

    // Local calculation of available slots for quick booking
    const calculateAvailableSlots = () => {
      const court = courts.find((c) => c.id === quickCourtId);
      if (!court) return [];

      const slots: string[] = [];
      const [startHour, startMin] = court.operatingHours.start.split(':').map(Number);
      const [endHour, endMin] = court.operatingHours.end.split(':').map(Number);
      const date = new Date(`${quickDate}T00:00:00`);

      let currentHour = startHour;
      let currentMin = startMin;

      while (currentHour < endHour || (currentHour === endHour && currentMin < endMin)) {
        const timeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`;

        // Find all active bookings that overlap this slot
        const slotStartMinutes = toMinutes(timeStr);
        const slotEndMinutes = slotStartMinutes + config.bookingInterval;
        const slotBookings = bookings.filter(
          (b) =>
            b.courtId === quickCourtId &&
            isSameDay(b.date, date) &&
            b.status !== 'cancelled' &&
            toMinutes(b.startTime) < slotEndMinutes &&
            toMinutes(b.endTime) > slotStartMinutes
        );

        let isAvailable = true;

        if (slotBookings.length > 0) {
          // If any private/training booking exists, slot is blocked
          const hasExclusiveBooking = slotBookings.some((b) => b.type === 'private' || b.type === 'training');

          if (hasExclusiveBooking) {
            isAvailable = false;
          } else if ('private' === 'private' || 'private' === 'training') {
            // Cannot book private if any open play exists
            isAvailable = false;
          } else {
            // Requesting open play, check capacity (default 4 for now)
            const totalPlayers = slotBookings.reduce((acc, b) => acc + 1 + (b.players?.length || 0), 0);
            if (totalPlayers >= 4) isAvailable = false;
          }
        }

        if (isAvailable) {
          slots.push(timeStr);
        }

        currentMin += config.bookingInterval;
        if (currentMin >= 60) {
          currentHour += 1;
          currentMin -= 60;
        }
      }

      return slots;
    };

    try {
      const slots = calculateAvailableSlots();
      if (cancelled) return;
      setQuickAvailableSlots(slots);
    } catch (error) {
      if (cancelled) return;
      setQuickAvailableSlots([]);
    } finally {
      if (cancelled) return;
      setQuickLoadingSlots(false);
    }

    return () => {
      cancelled = true;
    };
  }, [bookingMode, courts, bookings, config.bookingInterval, quickCourtId, quickDate]);

  const quickStartAllowed = useCallback(
    (start: string) => {
      if (!quickAvailableSlots) return false;
      if (quickDuration <= 0) return false;
      if (quickDuration % quickBookingStep !== 0) return false;
      const segments = Math.max(1, Math.floor(quickDuration / quickBookingStep));
      const set = new Set(quickAvailableSlots);
      for (let seg = 0; seg < segments; seg += 1) {
        const segmentStart = addMinutesToTime(start, seg * quickBookingStep);
        if (!set.has(segmentStart)) return false;
      }
      return true;
    },
    [quickAvailableSlots, quickDuration, quickBookingStep],
  );

  const quickStartAllowedForDuration = useCallback(
    (start: string, durationMinutes: number) => {
      if (!quickAvailableSlots) return false;
      if (durationMinutes <= 0) return false;
      if (durationMinutes % quickBookingStep !== 0) return false;
      const segments = Math.max(1, Math.floor(durationMinutes / quickBookingStep));
      const set = new Set(quickAvailableSlots);
      for (let seg = 0; seg < segments; seg += 1) {
        const segmentStart = addMinutesToTime(start, seg * quickBookingStep);
        if (!set.has(segmentStart)) return false;
      }
      return true;
    },
    [quickAvailableSlots, quickBookingStep],
  );

  const quickTimeValid = useMemo(
    () => quickTime && quickAvailableSlots ? quickStartAllowed(quickTime) : false,
    [quickTime, quickAvailableSlots, quickStartAllowed],
  );

  const quickSelectedEndTime = useMemo(
    () => (quickTime && quickDuration > 0 ? computeEndTime(quickTime, quickDuration) : ''),
    [quickTime, quickDuration],
  );

  const quickBookingSlots = useMemo(() => {
    if (!quickTime || quickDuration <= 0) return new Set<string>();
    const slots = new Set<string>();
    const segments = Math.max(1, Math.floor(quickDuration / quickBookingStep));
    for (let seg = 0; seg < segments; seg += 1) {
      const segmentStart = addMinutesToTime(quickTime, seg * quickBookingStep);
      slots.add(segmentStart);
    }
    return slots;
  }, [quickTime, quickDuration, quickBookingStep]);

  const quickHourOptions = useMemo(() => {
    const options: Array<{ hours: number; minutes: number }> = [];
    const minMinutes = 60;
    const halfHourStep = 30;
    const start = Math.max(minMinutes, quickBookingStep);
    for (let minutes = start; minutes <= quickMaxDuration; minutes += halfHourStep) {
      if (minutes % quickBookingStep !== 0) continue;
      options.push({ hours: minutes / 60, minutes });
    }
    return options.length > 0 ? options : [{ hours: 1, minutes: Math.max(minMinutes, quickBookingStep) }];
  }, [quickBookingStep, quickMaxDuration]);

  const handleQuickSubmit = async () => {
    setQuickSuccess(false);
    if (!quickFullName.trim()) {
      toast.error('Please enter your full name.');
      return;
    }
    if (!quickContactNumber.trim()) {
      toast.error('Please enter your contact number.');
      return;
    }
    if (!quickCourtId) {
      toast.error('Please select a court.');
      return;
    }
    if (!quickDate) {
      toast.error('Please select a reservation date.');
      return;
    }
    if (!quickTime) {
      toast.error('Please select a reservation time.');
      return;
    }

    const durationMinutes = quickDuration;
    const endTime = computeEndTime(quickTime, durationMinutes);
    const baseSlots = quickAvailableSlots ?? (await getAvailableSlots(quickCourtId, new Date(`${quickDate}T00:00:00`), 'private'));
    if (!baseSlots.includes(quickTime)) {
      toast.error('That time slot is no longer available. Please choose another time.');
      return;
    }
    if (durationMinutes % quickBookingStep === 0) {
      const segments = Math.max(1, Math.floor(durationMinutes / quickBookingStep));
      const set = new Set(baseSlots);
      for (let seg = 0; seg < segments; seg += 1) {
        const segmentStart = addMinutesToTime(quickTime, seg * quickBookingStep);
        if (!set.has(segmentStart)) {
          toast.error('That time range is no longer available. Please choose another time.');
          return;
        }
      }
    }

    const hourly = rateForTime(quickCourtId, quickTime);
    const amount = (hourly * durationMinutes) / 60;

    try {
      setQuickSubmitting(true);
      if (!usingBackendApi) throw new Error('Backend API is required for quick booking.');
      await backendApi.createQuickBooking({
        fullName: quickFullName.trim(),
        contactNumber: quickContactNumber.trim(),
        courtId: quickCourtId,
        date: quickDate,
        startTime: quickTime,
        endTime,
        duration: durationMinutes,
        amount,
        type: 'private',
      });
      setQuickSuccess(true);
      toast.success('Your reservation has been successfully submitted. Please wait for confirmation from the admin.');
      setQuickFullName('');
      setQuickContactNumber('');
      setQuickTime('');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to submit reservation.');
    } finally {
      setQuickSubmitting(false);
    }
  };

  if (!selectedCourt) {
    const setupMessage = systemSetup.setupRequired
      ? systemSetup.missingTables.length > 0
        ? 'Booking is unavailable because the backend database setup is incomplete.'
        : systemSetup.needsCourts
          ? 'Booking is unavailable because no courts have been configured yet.'
          : 'Booking is temporarily unavailable while the system setup is being completed.'
      : 'No active court is available for booking.';
    const setupActionLabel = systemSetup.missingTables.length > 0
      ? 'Open System Settings'
      : systemSetup.needsCourts
        ? 'Open Court Management'
        : quickOnly
          ? 'Back to Home'
          : 'Back to Booking';
    const handleSetupAction = () => {
      if (currentUser?.role === 'admin') {
        if (systemSetup.missingTables.length > 0) {
          navigate('/settings');
          return;
        }
        if (systemSetup.needsCourts) {
          navigate('/court-mgmt');
          return;
        }
      }
      if (currentUser?.role === 'staff' && systemSetup.needsCourts) {
        navigate('/court-mgmt');
        return;
      }
      navigate(quickOnly ? '/' : '/booking');
    };
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow p-6 text-center">
          <p className="text-slate-700 dark:text-slate-300 mb-3">{setupMessage}</p>
          {systemSetup.setupRequired ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              {systemSetup.missingTables.length > 0
                ? `Missing database tables: ${systemSetup.missingTables.join(', ')}. Run the Supabase schema and migrations before accepting reservations.`
                : systemSetup.needsCourts
                  ? 'Create at least one active court before players can book.'
                  : 'Complete the remaining system setup steps and try again.'}
            </p>
          ) : null}
          <button
            type="button"
            onClick={handleSetupAction}
            className="px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700"
          >
            {setupActionLabel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1500px] p-3 sm:p-4 md:p-6 xl:p-8">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl p-4 sm:p-5 md:p-8 xl:p-10">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 md:text-3xl">Book Courts</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Choose standard booking (account required) or quick booking (no account required).
          </p>
        </div>

        {!quickOnly ? (
          <div className="grid gap-3 sm:grid-cols-2 mb-6">
            <button
              type="button"
              onClick={() => setBookingMode('standard')}
              className={`rounded-2xl border px-5 py-5 text-left transition-colors ${
                bookingMode === 'standard'
                  ? 'border-teal-600 bg-teal-50 dark:bg-teal-900/20'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <div className="text-lg font-bold text-slate-900 dark:text-slate-100">Standard Reservation</div>
              <div className="text-slate-600 dark:text-slate-400">Multi-slot booking with payment flow (sign in required).</div>
            </button>

            <button
              type="button"
              onClick={() => setBookingMode('quick')}
              className={`rounded-2xl border px-5 py-5 text-left transition-colors ${
                bookingMode === 'quick'
                  ? 'border-teal-600 bg-teal-50 dark:bg-teal-900/20'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Senior Citizen Friendly Reservation (Quick Booking – No Account Required)
              </div>
              <div className="text-slate-600 dark:text-slate-400">Simple 1-hour reservation with fewer steps.</div>
            </button>
          </div>
        ) : null}

        {bookingMode === 'quick' ? (
          <div className="mx-auto w-full max-w-3xl">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-6 sm:p-8">
              <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Quick Booking (No Account Needed)</h3>
              <p className="mt-2 text-slate-700 dark:text-slate-300 text-lg">
                Fill in the details below. Your request will be submitted for admin confirmation.
              </p>

              {quickSuccess ? (
                <div className="mt-5 rounded-xl border border-teal-200 bg-teal-50 px-5 py-4 text-teal-900">
                  Your reservation has been successfully submitted. Please wait for confirmation from the admin.
                </div>
              ) : null}

              <div className="mt-6 grid gap-5">
                <div>
                  <label className="block text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Full Name</label>
                  <input
                    value={quickFullName}
                    onChange={(e) => setQuickFullName(e.target.value)}
                    placeholder="e.g., Juan Dela Cruz"
                    className="w-full h-14 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-lg text-slate-900 dark:text-slate-100 outline-none focus:border-teal-600"
                  />
                </div>

                <div>
                  <label className="block text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Contact Number</label>
                  <input
                    value={quickContactNumber}
                    onChange={(e) => setQuickContactNumber(e.target.value)}
                    inputMode="tel"
                    placeholder="e.g., 09xx xxx xxxx"
                    className="w-full h-14 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-lg text-slate-900 dark:text-slate-100 outline-none focus:border-teal-600"
                  />
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <label className="block text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Preferred Court</label>
                    <select
                      value={quickCourtId}
                      onChange={(e) => {
                        setQuickCourtId(e.target.value);
                        setQuickTime('');
                      }}
                      className="w-full h-14 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-lg text-slate-900 dark:text-slate-100 outline-none focus:border-teal-600"
                    >
                      {courts
                        .filter((c) => c.status === 'active')
                        .map((court) => (
                          <option key={court.id} value={court.id}>
                            {court.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Reservation Date</label>
                    <div className="relative">
                      <CalendarIcon
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400"
                        size={20}
                      />
                      <input
                        type="date"
                        value={quickDate}
                        min={format(new Date(), 'yyyy-MM-dd')}
                        onChange={(e) => {
                          setQuickDate(e.target.value);
                          setQuickTime('');
                        }}
                        className="w-full h-14 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-12 pr-4 text-lg text-slate-900 dark:text-slate-100 outline-none focus:border-teal-600"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Reservation Time</label>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-base font-semibold text-slate-800 dark:text-slate-200 mb-2">How many hours</label>
                      <input
                        type="number"
                        value={(quickDuration / 60).toFixed(2).replace(/\.00$/, '')}
                        min={quickBookingStep / 60}
                        max={quickMaxDuration / 60}
                        step={quickBookingStep / 60}
                        onChange={(e) => {
                          const hours = Number(e.target.value);
                          if (Number.isFinite(hours) && hours > 0) {
                            setQuickDuration(Math.round(hours * 60));
                            setQuickTime('');
                          }
                        }}
                        className="w-full h-14 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-lg text-slate-900 dark:text-slate-100 outline-none focus:border-teal-600"
                      />
                      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                        Enter the number of hours manually. Max: {toTimeLabel(quickMaxDuration)}. Selected: {toTimeLabel(quickDuration)}.
                      </p>
                    </div>

                    <div>
                      <label className="block text-base font-semibold text-slate-800 dark:text-slate-200 mb-2">Selected time range</label>
                      <div className="h-14 rounded-xl border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900/50 px-4 flex items-center text-lg text-slate-900 dark:text-slate-100">
                        {quickTime ? (
                          <span>
                            {format12Time(quickTime)} – {format12Time(quickSelectedEndTime)}
                          </span>
                        ) : (
                          <span className="text-slate-500 dark:text-slate-400">Select a start time</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-3">Start Time</div>
                    {!quickDate ? (
                      <p className="text-sm text-slate-600 dark:text-slate-400">Select a date first to see available start times.</p>
                    ) : quickAvailableSlots && quickAvailableSlots.length > 0 ? (
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                        {quickAvailableSlots.map((time) => {
                          const isStart = quickTime === time;
                          const isPartOfBooking = quickBookingSlots.has(time);
                          const canStart = quickAvailableSlots.includes(time);
                          return (
                            <button
                              key={time}
                              type="button"
                              disabled={!canStart}
                              onClick={() => setQuickTime(quickTime === time ? '' : time)}
                              className={`h-11 rounded-xl border text-sm font-semibold transition-colors disabled:opacity-50 ${
                                isStart
                                  ? 'border-teal-700 bg-teal-600 text-white'
                                  : isPartOfBooking
                                    ? 'border-orange-500 bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200'
                                    : canStart
                                      ? 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/30 text-slate-400 dark:text-slate-500'
                              }`}
                            >
                              {format12Time(time)}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-600 dark:text-slate-400">No times are available for the selected court and date.</p>
                    )}
                    {quickTime && quickAvailableSlots != null ? (
                      quickTimeValid ? (
                        <p className="mt-3 text-sm text-teal-700 dark:text-teal-300">Selected time is available. Orange slots show the full booking duration.</p>
                      ) : (
                        <p className="mt-3 text-sm text-orange-700 dark:text-orange-300">The selected duration may not fit at this start time. Orange slots show what would be booked if available.</p>
                      )
                    ) : null}
                  </div>
                  <p className="mt-2 text-base text-slate-600 dark:text-slate-400">
                    Select a start time to see which subsequent slots will be reserved for your booking duration.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void handleQuickSubmit()}
                  disabled={quickSubmitting}
                  className="h-16 rounded-2xl bg-teal-600 text-white text-xl font-bold hover:bg-teal-700 disabled:opacity-60"
                >
                  {quickSubmitting ? 'Submitting...' : 'Submit Quick Reservation'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="space-y-6">
              <div>
                <label className="block text-base font-semibold text-slate-800 dark:text-slate-200 mb-2">Your name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full h-12 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 text-base text-slate-900 dark:text-slate-100 outline-none focus:border-teal-600"
                />
              </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Add Court Slot</h3>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-base font-semibold text-slate-800 dark:text-slate-200 mb-2">Select date</label>
                  <div className="relative">
                    <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" size={18} />
                    <input
                      type="date"
                      value={selectedDate}
                      min={format(new Date(), 'yyyy-MM-dd')}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="w-full h-12 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-10 pr-3 text-base text-slate-900 dark:text-slate-100 outline-none focus:border-teal-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-base font-semibold text-slate-800 dark:text-slate-200 mb-2">Court</label>
                  <select
                    value={selectedCourtId}
                    onChange={(e) => setSelectedCourtId(e.target.value)}
                    className="w-full h-12 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-base text-slate-900 dark:text-slate-100 outline-none focus:border-teal-600"
                  >
                    {courts
                      .filter((c) => c.status === 'active')
                      .map((court) => (
                        <option key={court.id} value={court.id}>
                          {court.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-base font-semibold text-slate-800 dark:text-slate-200 mb-3">Start Time</label>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <select
                      value={selectedTime}
                      onChange={(e) => setSelectedTime(e.target.value)}
                      disabled={!selectedDate || hourlyTimeOptions.length === 0}
                      className="w-full h-12 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 text-base text-slate-900 dark:text-slate-100 outline-none focus:border-teal-600 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <option value="">Select an hourly start time</option>
                      {hourlyTimeOptions.map((time) => (
                        <option key={time} value={time}>
                          {format12Time(time)}
                        </option>
                      ))}
                    </select>
                    {!selectedDate ? (
                      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Select a date first to choose a start time.</p>
                    ) : hourlyTimeOptions.length === 0 ? (
                      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">No hourly start times are available for this court.</p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      Choose a whole-hour start time from the dropdown.
                    </div>
                    {selectedTime ? (
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        Selected range preview: {format12Time(selectedTime)} - {format12Time(selectedRangeEndTime)}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-base font-semibold text-slate-800 dark:text-slate-200 mb-2">Duration (hours)</label>
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={duration / 60}
                    onChange={(e) => {
                      const hours = Number(e.target.value);
                      if (Number.isFinite(hours) && hours > 0) {
                        setDuration(Math.round(hours * 60));
                      }
                    }}
                    className="h-12 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 text-base text-slate-900 dark:text-slate-100 outline-none focus:border-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-base font-semibold text-slate-800 dark:text-slate-200 mb-2">Booking Type</label>
                  <select
                    value={bookingType}
                    onChange={(e) => setBookingType(e.target.value as BookingType)}
                    className="h-12 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-base text-slate-900 dark:text-slate-100 outline-none focus:border-teal-600"
                  >
                    <option value="private">Private</option>
                    <option value="open_play">Open Play</option>
                    <option value="training">Training</option>
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={handleAddRow}
                className="h-11 rounded-lg bg-teal-600 px-5 text-white hover:bg-teal-700"
              >
                Add This Slot
              </button>
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Selected Court Slots</h3>
              {rows.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">No slots added yet.</p>
              ) : (
                rows.map((row) => {
                  const draft = toDraft(row);
                  const court = courts.find((c) => c.id === row.courtId);
                  const unavailable = unavailableByRowId[row.id];
                  return (
                    <div
                      key={row.id}
                      className={`rounded-xl border p-4 ${
                        unavailable
                          ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/70'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-sm text-slate-800 dark:text-slate-200">
                          <p className="font-semibold">{court?.name || row.courtId}</p>
                          <p>{COURT_SPORT[row.courtId] || 'General'} | {row.type.replace('_', ' ')}</p>
                          <p>{row.date} | {format12Time(row.startTime)} - {format12Time(draft.endTime)}</p>
                          <p>{toTimeLabel(row.duration)} | ₱{draft.amount.toFixed(0)}</p>
                          {unavailable ? <p className="mt-1 text-red-700 dark:text-red-300">{unavailable}</p> : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(row.id)}
                          className="h-9 w-9 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 flex items-center justify-center"
                          aria-label="Remove slot"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="h-fit xl:sticky xl:top-6">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-3">Booking Summary</h3>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#d6e8e8] dark:bg-slate-800 p-4">
              <div className="text-sm text-slate-800 dark:text-slate-200 space-y-1 max-h-72 overflow-auto pr-1">
                {rows.length === 0 ? (
                  <p>No court slots added.</p>
                ) : (
                  rows.map((row) => {
                    const draft = toDraft(row);
                    const court = courts.find((c) => c.id === row.courtId);
                    return (
                      <div key={row.id} className="rounded-lg bg-white/60 dark:bg-slate-700/60 p-2">
                        <p className="font-semibold">{court?.name || row.courtId}</p>
                        <p>{row.date} | {format12Time(row.startTime)}-{format12Time(draft.endTime)}</p>
                        <p>{toTimeLabel(row.duration)} | ₱{draft.amount.toFixed(0)}</p>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="h-px bg-slate-400/40 dark:bg-slate-600/40 my-3" />
              <div className="flex items-center justify-between text-xl font-bold text-slate-900 dark:text-slate-100">
                <span>Total Price:</span>
                <span>₱{totalPrice.toFixed(0)}</span>
              </div>
            </div>
          </div>
        </div>

          <div className="flex flex-col-reverse gap-3 pt-6 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => navigate('/booking')}
              className="h-11 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-6 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 sm:w-auto"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleProceed()}
              className="h-11 rounded-lg bg-teal-600 px-6 text-white hover:bg-teal-700 sm:w-auto"
            >
              Proceed to Payment ({rows.length})
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
