import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Calendar as CalendarIcon, Trash2 } from 'lucide-react';
import { addMinutes, format } from 'date-fns';
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

const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => {
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd);
};

export function BookingInterface() {
  const { currentUser, courts, config, getAvailableSlots } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const prefillCourtId = (location.state as { prefillCourtId?: string } | null)?.prefillCourtId;

  const defaultCourtId = prefillCourtId || courts.find((c) => c.status === 'active')?.id || '';
  const [name, setName] = useState(currentUser?.name || '');
  const [selectedCourtId, setSelectedCourtId] = useState(defaultCourtId);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [duration, setDuration] = useState(config.bookingInterval || 60);
  const [bookingType, setBookingType] = useState<BookingType>('private');
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [unavailableByRowId, setUnavailableByRowId] = useState<Record<string, string>>({});

  const selectedCourt = useMemo(() => courts.find((c) => c.id === selectedCourtId), [courts, selectedCourtId]);
  const usingBackendApi = backendApi.isEnabled;

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

  const rateForTime = (courtId: string, startTime: string) => {
    const court = courts.find((c) => c.id === courtId);
    if (!court) return 0;
    const isPeak = config.peakHours.some((peak) => startTime >= peak.start && startTime <= peak.end);
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

  if (!selectedCourt) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow p-6 text-center">
          <p className="text-slate-700 dark:text-slate-300 mb-4">No active court is available for booking.</p>
          <button
            type="button"
            onClick={() => navigate('/booking')}
            className="px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700"
          >
            Back to Booking
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
            Add multiple courts with different time slots. Unavailable slots will be flagged per court.
          </p>
        </div>

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
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6">
                  {timeOptions.map((time) => {
                    const isStart = selectedTime === time;
                    const inRange =
                      !!selectedTime &&
                      !!selectedRangeEndTime &&
                      toMinutes(time) >= toMinutes(selectedTime) &&
                      toMinutes(time) < toMinutes(selectedRangeEndTime);

                    return (
                      <button
                        key={time}
                        type="button"
                        onClick={() => setSelectedTime(time)}
                        className={`h-11 rounded-lg border text-sm transition-colors sm:text-base ${
                          isStart
                            ? 'border-teal-700 bg-teal-600 text-white'
                            : inRange
                              ? 'border-teal-300 bg-teal-100 text-teal-900 dark:border-teal-700 dark:bg-teal-900/40 dark:text-teal-100'
                              : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        {format12Time(time)}
                      </button>
                    );
                  })}
                </div>
                {selectedTime && selectedRangeEndTime ? (
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                    Selected range preview: {format12Time(selectedTime)} - {format12Time(selectedRangeEndTime)}
                  </p>
                ) : null}
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
                          <p>{toTimeLabel(row.duration)} | PHP {draft.amount.toFixed(0)}</p>
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
                        <p>{toTimeLabel(row.duration)} | PHP {draft.amount.toFixed(0)}</p>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="h-px bg-slate-400/40 dark:bg-slate-600/40 my-3" />
              <div className="flex items-center justify-between text-xl font-bold text-slate-900 dark:text-slate-100">
                <span>Total Price:</span>
                <span>PHP {totalPrice.toFixed(0)}</span>
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
      </div>
    </div>
  );
}
