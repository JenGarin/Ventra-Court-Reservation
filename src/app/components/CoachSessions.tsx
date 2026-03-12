import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { backendApi } from '@/context/backendApi';
import { Calendar, Clock, Users, Plus, MapPin, X } from 'lucide-react';
import { format, startOfToday } from 'date-fns';
import { toast } from 'sonner';

function toTimeOptions(start: string, end: string, interval = 60): string[] {
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  let current = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  const options: string[] = [];

  while (current + interval <= endMinutes) {
    const hh = String(Math.floor(current / 60)).padStart(2, '0');
    const mm = String(current % 60).padStart(2, '0');
    options.push(`${hh}:${mm}`);
    current += interval;
  }
  return options;
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function addMinutesToTime(time: string, minutesToAdd: number): string {
  const total = toMinutes(time) + minutesToAdd;
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function hasTimeOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  const aStart = toMinutes(startA);
  const aEnd = toMinutes(endA);
  const bStart = toMinutes(startB);
  const bEnd = toMinutes(endB);
  return aStart < bEnd && bStart < aEnd;
}

function getSportKey(courtName: string): string {
  const n = courtName.toLowerCase();
  if (n.includes('basket')) return 'basketball';
  if (n.includes('tennis')) return 'tennis';
  if (n.includes('pickle')) return 'pickleball';
  return 'training';
}

export function CoachSessions() {
  const { currentUser, bookings, courts, users, createCoachSession, deleteCoachSession, getCoachEligibleStudents, config } = useApp();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedDate, setSelectedDate] = useState(format(startOfToday(), 'yyyy-MM-dd'));
  const [selectedTime, setSelectedTime] = useState('');
  const [selectedCourt, setSelectedCourt] = useState('');
  const [duration, setDuration] = useState(60);
  const [maxStudents, setMaxStudents] = useState(4);
  const [notes, setNotes] = useState('');
  const [backendEligibleStudents, setBackendEligibleStudents] = useState<typeof users>([]);

  useEffect(() => {
    if (!selectedCourt && courts.length > 0) {
      setSelectedCourt(courts[0].id);
    }
  }, [courts, selectedCourt]);

  const selectedCourtData = courts.find((c) => c.id === selectedCourt);
  const selectedSportKey = getSportKey(selectedCourtData?.name || '');
  const timeOptions = useMemo(() => {
    const operating = selectedCourtData?.operatingHours || { start: '07:00', end: '22:00' };
    return toTimeOptions(operating.start, operating.end, config.bookingInterval || 60);
  }, [selectedCourtData, config.bookingInterval]);

  useEffect(() => {
    if (!selectedTime && timeOptions.length > 0) {
      setSelectedTime(timeOptions[0]);
    }
  }, [timeOptions, selectedTime]);

  const mySessions = useMemo(
    () =>
      bookings
        .filter((b) => b.userId === currentUser?.id && b.type === 'training' && b.status !== 'cancelled')
        .sort((a, b) => b.date.getTime() - a.date.getTime()),
    [bookings, currentUser]
  );

  const autoDetectedStudents = useMemo(() => {
    if (!currentUser || !selectedCourtData || !selectedTime) return [];
    const selectedEndTime = addMinutesToTime(selectedTime, duration);
    const selectedDateObj = new Date(`${selectedDate}T00:00:00`);
    const selectedDateKey = format(selectedDateObj, 'yyyy-MM-dd');

    const studentIds = new Set<string>();

    bookings.forEach((b) => {
      if (b.type !== 'training') return;
      if (b.status !== 'confirmed') return;
      if (b.coachId !== currentUser.id) return;
      if (b.userId === currentUser.id) return;

      const requestUser = users.find((u) => u.id === b.userId);
      if (!requestUser || requestUser.role !== 'player') return;

      const requestCourt = courts.find((c) => c.id === b.courtId);
      const requestSportKey = getSportKey(requestCourt?.name || '');
      if (requestSportKey !== selectedSportKey) return;

      const requestDateKey = format(new Date(b.date), 'yyyy-MM-dd');
      if (requestDateKey !== selectedDateKey) return;

      if (!hasTimeOverlap(selectedTime, selectedEndTime, b.startTime, b.endTime)) return;
      studentIds.add(b.userId);
    });

    return users.filter((u) => studentIds.has(u.id));
  }, [bookings, courts, currentUser, users, selectedCourtData, selectedSportKey, selectedDate, selectedTime, duration]);

  useEffect(() => {
    let active = true;
    if (!backendApi.isEnabled || !selectedCourt) {
      setBackendEligibleStudents([]);
      return;
    }
    getCoachEligibleStudents({ courtId: selectedCourt })
      .then((list) => {
        if (!active) return;
        setBackendEligibleStudents(list.filter((user) => user.role === 'player'));
      })
      .catch(() => {
        if (!active) return;
        setBackendEligibleStudents([]);
      });
    return () => {
      active = false;
    };
  }, [getCoachEligibleStudents, selectedCourt]);

  const resolvedAutoStudents = backendApi.isEnabled ? backendEligibleStudents : autoDetectedStudents;

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!selectedCourt) {
      toast.error('Please select a court.');
      return;
    }
    if (!selectedTime) {
      toast.error('Please select a time.');
      return;
    }

    const endTime = addMinutesToTime(selectedTime, duration);
    const parsedDate = new Date(`${selectedDate}T00:00:00`);
    const autoStudentIds = resolvedAutoStudents.map((u) => u.id);
    const resolvedMaxStudents = Math.max(maxStudents, autoStudentIds.length || 0);

    setIsSubmitting(true);
    try {
      await createCoachSession({
        courtId: selectedCourt,
        date: parsedDate,
        startTime: selectedTime,
        endTime,
        duration,
        maxPlayers: resolvedMaxStudents,
        notes,
        amount: 0,
        sport: selectedSportKey,
      });

      toast.success(
        autoStudentIds.length > 0
          ? `New session created with ${autoStudentIds.length} auto-enrolled student(s).`
          : 'New session created.'
      );
      setIsModalOpen(false);
      setNotes('');
    } catch {
      toast.error('Failed to create session.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelSession = async (id: string) => {
    if (!confirm('Cancel this training session?')) return;
    await deleteCoachSession(id);
    toast.success('Session cancelled.');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 p-6 space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Coaching Sessions</h1>
          <p className="text-slate-500 dark:text-slate-400">Create and manage your training sessions.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-teal-700 transition-colors"
        >
          <Plus size={18} />
          New Session
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">All Sessions</h2>
        </div>

        <div className="p-5 space-y-4">
          {mySessions.length === 0 && (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">
              No sessions yet. Click <span className="font-semibold">New Session</span> to create one.
            </div>
          )}

          {mySessions.map((session) => {
            const court = courts.find((c) => c.id === session.courtId);
            return (
              <article
                key={session.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50 dark:bg-slate-900/40"
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="space-y-2">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      {format(session.date, 'EEEE, MMM dd yyyy')} • {session.startTime}-{session.endTime}
                    </h3>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={14} />
                        {court?.name || 'Unknown Court'}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock size={14} />
                        {session.duration} mins
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users size={14} />
                        {(session.players || []).length}/{session.maxPlayers || 0}
                      </span>
                    </div>
                    {session.notes && (
                      <p className="text-sm text-slate-500 dark:text-slate-400">{session.notes}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleCancelSession(session.id)}
                    className="self-start md:self-auto px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 text-sm font-medium hover:bg-rose-100 dark:hover:bg-rose-900/30"
                  >
                    Cancel
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-xl border border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Create New Session</h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSession} className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="space-y-1">
                  <span className="text-sm text-slate-700 dark:text-slate-300">Court</span>
                  <select
                    value={selectedCourt}
                    onChange={(e) => setSelectedCourt(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
                    required
                  >
                    {courts.map((court) => (
                      <option key={court.id} value={court.id}>
                        {court.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-sm text-slate-700 dark:text-slate-300">Date</span>
                  <input
                    type="date"
                    value={selectedDate}
                    min={format(startOfToday(), 'yyyy-MM-dd')}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
                    required
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-sm text-slate-700 dark:text-slate-300">Start Time</span>
                  <select
                    value={selectedTime}
                    onChange={(e) => setSelectedTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
                    required
                  >
                    {timeOptions.map((time) => (
                      <option key={time} value={time}>
                        {time}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-sm text-slate-700 dark:text-slate-300">Duration</span>
                  <select
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
                  >
                    <option value={60}>60 mins</option>
                    <option value={90}>90 mins</option>
                    <option value={120}>120 mins</option>
                  </select>
                </label>

                <label className="space-y-1 md:col-span-2">
                  <span className="text-sm text-slate-700 dark:text-slate-300">Max Students</span>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={maxStudents}
                    onChange={(e) => setMaxStudents(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
                  />
                </label>

                <div className="md:col-span-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-3">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    Auto-detected approved students ({selectedSportKey}): {resolvedAutoStudents.length}
                  </p>
                  {resolvedAutoStudents.length > 0 ? (
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                      {resolvedAutoStudents.map((s) => s.name || s.email).join(', ')}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      No approved matching students for this sport/date/time yet.
                    </p>
                  )}
                </div>
              </div>

              <label className="space-y-1 block">
                <span className="text-sm text-slate-700 dark:text-slate-300">Session Notes</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 resize-none"
                  placeholder="Focus, drills, or reminders."
                />
              </label>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-lg bg-teal-600 text-white font-semibold hover:bg-teal-700 disabled:opacity-60"
                >
                  {isSubmitting ? 'Creating...' : 'Create Session'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
