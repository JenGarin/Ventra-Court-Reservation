import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { backendApi } from '@/context/backendApi';
import {
  CalendarDays,
  Users,
  PhilippinePeso,
  BarChart3,
  Clock3,
  MapPin,
  Plus,
  Pencil,
  Trash2,
  Calendar,
  UserRound,
  UserCheck,
} from 'lucide-react';
import { format, isSameDay, startOfToday } from 'date-fns';
import { toast } from 'sonner';

const COURT_META: Record<string, { location: string; sport: string; image: string }> = {
  c1: { location: 'Downtown Sports Complex', sport: 'Basketball', image: '/basketball%20coach.png' },
  c2: { location: 'Riverside Tennis Court 1', sport: 'Tennis', image: '/tennis%20coach.png' },
  c3: { location: 'Elite Sports Hub', sport: 'Pickle Ball', image: '/pickle%20ball.png' },
};

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function hasTimeOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  const aStart = toMinutes(startA);
  const aEnd = toMinutes(endA);
  const bStart = toMinutes(startB);
  const bEnd = toMinutes(endB);
  return aStart < bEnd && bStart < aEnd;
}

export function CoachPortalView() {
  const { currentUser, bookings, users, courts, confirmBooking, cancelBooking } = useApp();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'sessions' | 'students' | 'schedule'>('sessions');
  const [backendPendingApplications, setBackendPendingApplications] = useState<any[]>([]);
  const [isApplicationsLoading, setIsApplicationsLoading] = useState(false);

  const coachSessions = useMemo(
    () =>
      bookings
        .filter(
          (b) =>
            b.type === 'training' &&
            (b.userId === currentUser?.id || b.coachId === currentUser?.id) &&
            b.status !== 'cancelled' &&
            b.status !== 'pending'
        )
        .sort((a, b) => a.date.getTime() - b.date.getTime()),
    [bookings, currentUser]
  );

  const getSessionStudentIds = (session: (typeof coachSessions)[number]) => {
    const playerIds = new Set<string>(session.players || []);
    const bookingOwner = users.find((u) => u.id === session.userId);
    const ownerIsPlayer = bookingOwner?.role === 'player';

    // For coach-created sessions, include approved player requests for the same timeslot.
    if (session.userId === currentUser?.id) {
      const matchedRequests = bookings.filter(
        (b) =>
          b.id !== session.id &&
          b.type === 'training' &&
          b.coachId === currentUser?.id &&
          b.status !== 'pending' &&
          b.status !== 'cancelled' &&
          b.courtId === session.courtId &&
          isSameDay(b.date, session.date) &&
          hasTimeOverlap(session.startTime, session.endTime, b.startTime, b.endTime)
      );

      matchedRequests.forEach((request) => {
        const requestUser = users.find((u) => u.id === request.userId);
        if (requestUser?.role === 'player') {
          playerIds.add(request.userId);
        }
      });
    }

    // Fallback for older/manual records where players[] is empty but booking owner is the player.
    if (playerIds.size === 0 && ownerIsPlayer) {
      playerIds.add(session.userId);
    }

    return Array.from(playerIds);
  };

  const today = startOfToday();
  const upcomingSessions = coachSessions.filter((s) => s.date >= today);
  const completedSessions = coachSessions.filter((s) => s.status === 'completed');

  const totalStudents = useMemo(() => {
    const allStudentIds = new Set<string>();
    coachSessions.forEach((s) => getSessionStudentIds(s).forEach((id) => allStudentIds.add(id)));
    return allStudentIds.size;
  }, [coachSessions, users]);

  const totalEarnings = coachSessions.reduce((sum, s) => sum + (s.amount || 0), 0);
  const localPendingApplications = useMemo(
    () =>
      bookings
        .filter(
          (b) =>
            b.coachId === currentUser?.id &&
            b.type === 'training' &&
            b.status === 'pending'
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    [bookings, currentUser]
  );

  useEffect(() => {
    let active = true;
    if (!backendApi.isEnabled || currentUser?.role !== 'coach') {
      setBackendPendingApplications([]);
      return;
    }
    setIsApplicationsLoading(true);
    backendApi
      .getCoachApplications({ status: 'pending' })
      .then((rows) => {
        if (!active) return;
        setBackendPendingApplications(rows);
      })
      .catch(() => {
        if (!active) return;
        setBackendPendingApplications([]);
      })
      .finally(() => {
        if (!active) return;
        setIsApplicationsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [currentUser]);

  const pendingApplications = useMemo(() => {
    if (!backendApi.isEnabled) {
      return localPendingApplications.map((booking) => ({
        id: booking.id,
        playerId: booking.userId,
        sport: COURT_META[booking.courtId]?.sport || 'Training',
        createdAt: booking.createdAt,
        displayDate: `${format(booking.date, 'EEE, MMM dd yyyy')} · ${booking.startTime}-${booking.endTime}`,
        displayLocation: courts.find((c) => c.id === booking.courtId)?.name || 'Court',
        notes: booking.notes,
        source: 'booking' as const,
      }));
    }

    return backendPendingApplications.map((application) => ({
      id: String(application?.id || ''),
      playerId: String(application?.playerId || ''),
      sport: String(application?.sport || 'Training'),
      createdAt: new Date(application?.createdAt || Date.now()),
      displayDate: `Applied ${format(new Date(application?.createdAt || Date.now()), 'EEE, MMM dd yyyy')}`,
      displayLocation: String(application?.preferredSchedule || 'No preferred schedule provided'),
      notes: String(application?.message || ''),
      source: 'coach_application' as const,
    }));
  }, [backendPendingApplications, courts, localPendingApplications]);

  const sessionCards = upcomingSessions.slice(0, 4);
  const studentCards = useMemo(() => {
    const playerMap = new Map<
      string,
      {
        id: string;
        name: string;
        email: string;
        avatar: string;
        sportCount: Record<string, number>;
        sessions: number;
        totalPaid: number;
        level: string;
      }
    >();

    coachSessions.forEach((session) => {
      const sport = COURT_META[session.courtId]?.sport || 'Training';
      getSessionStudentIds(session).forEach((playerId) => {
        const student = users.find((u) => u.id === playerId);
        if (!student) return;

        const existing = playerMap.get(playerId);
        if (!existing) {
          playerMap.set(playerId, {
            id: student.id,
            name: student.name || student.email,
            email: student.email,
            avatar: student.avatar || '',
            sportCount: { [sport]: 1 },
            sessions: 1,
            totalPaid: session.amount || 0,
            level: student.skillLevel || 'beginner',
          });
          return;
        }

        existing.sessions += 1;
        existing.totalPaid += session.amount || 0;
        existing.sportCount[sport] = (existing.sportCount[sport] || 0) + 1;
      });
    });

    return Array.from(playerMap.values())
      .map((student) => {
        const primarySport = Object.entries(student.sportCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Training';
        const progress = Math.min(100, Math.round((student.sessions / 10) * 100));
        return { ...student, primarySport, progress };
      })
      .sort((a, b) => b.sessions - a.sessions);
  }, [coachSessions, users]);

  const scheduleCards = upcomingSessions.slice(0, 8);

  const handleApproveApplication = async (applicationId: string, source: 'booking' | 'coach_application') => {
    try {
      if (source === 'coach_application' && backendApi.isEnabled) {
        await backendApi.approveCoachApplication(applicationId);
        setBackendPendingApplications((prev) => prev.filter((item) => String(item?.id || '') !== applicationId));
      } else {
        await confirmBooking(applicationId);
      }
      toast.success('Application approved.');
    } catch {
      toast.error('Failed to approve application.');
    }
  };

  const handleDeclineApplication = async (applicationId: string, source: 'booking' | 'coach_application') => {
    try {
      if (source === 'coach_application' && backendApi.isEnabled) {
        await backendApi.rejectCoachApplication(applicationId);
        setBackendPendingApplications((prev) => prev.filter((item) => String(item?.id || '') !== applicationId));
      } else {
        await cancelBooking(applicationId);
      }
      toast.success('Application declined.');
    } catch {
      toast.error('Failed to decline application.');
    }
  };

  return (
    <div className="min-h-screen bg-[#dce9ea] dark:bg-slate-950 rounded-2xl p-4 md:p-6 xl:p-8 space-y-5 transition-colors">
      <section className="mx-auto max-w-[1320px] bg-[#ced9dc] dark:bg-slate-900 rounded-3xl border border-slate-300/60 dark:border-slate-800 shadow-sm px-5 md:px-7 py-6 flex items-center gap-4 md:gap-5">
        <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white/70 dark:bg-slate-800 border border-white/60 dark:border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
          <img src="/icon%201.png" alt="Coach Icon" className="w-11 h-11 md:w-14 md:h-14 object-contain" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Coach Dashboard</h1>
          <p className="text-slate-700 dark:text-slate-300 text-sm md:text-lg mt-1">Manage your training sessions and students</p>
        </div>
      </section>

      <section className="mx-auto max-w-[1320px] grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <article className="rounded-2xl bg-[#cfe6f1] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 p-4 md:p-5 shadow-sm min-h-[150px]">
          <div className="flex items-center justify-between">
            <h3 className="text-lg md:text-xl font-semibold text-slate-900 dark:text-slate-100">Upcoming Sessions</h3>
            <CalendarDays className="w-5 h-5 md:w-6 md:h-6 text-slate-700 dark:text-slate-300" />
          </div>
          <p className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-slate-100 mt-6">{upcomingSessions.length}</p>
          <p className="text-slate-700 dark:text-slate-300 text-sm md:text-base">Training sessions scheduled</p>
        </article>

        <article className="rounded-2xl bg-[#d9f0d5] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 p-4 md:p-5 shadow-sm min-h-[150px]">
          <div className="flex items-center justify-between">
            <h3 className="text-lg md:text-xl font-semibold text-slate-900 dark:text-slate-100">Total Students</h3>
            <Users className="w-5 h-5 md:w-6 md:h-6 text-slate-700 dark:text-slate-300" />
          </div>
          <p className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-slate-100 mt-6">{totalStudents}</p>
          <p className="text-slate-700 dark:text-slate-300 text-sm md:text-base">Active students</p>
        </article>

        <article className="rounded-2xl bg-[#e9d1ec] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 p-4 md:p-5 shadow-sm min-h-[150px]">
          <div className="flex items-center justify-between">
            <h3 className="text-lg md:text-xl font-semibold text-slate-900 dark:text-slate-100">Total Earnings</h3>
            <PhilippinePeso className="w-5 h-5 md:w-6 md:h-6 text-slate-700 dark:text-slate-300" />
          </div>
          <p className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-slate-100 mt-6">PHP {totalEarnings.toFixed(0)}</p>
          <p className="text-slate-700 dark:text-slate-300 text-sm md:text-base">From all sessions</p>
        </article>

        <article className="rounded-2xl bg-[#ecdcc5] dark:bg-slate-900 border border-slate-300/60 dark:border-slate-800 p-4 md:p-5 shadow-sm min-h-[150px]">
          <div className="flex items-center justify-between">
            <h3 className="text-lg md:text-xl font-semibold text-slate-900 dark:text-slate-100">Coach Applications</h3>
            <BarChart3 className="w-5 h-5 md:w-6 md:h-6 text-slate-700 dark:text-slate-300" />
          </div>
          <p className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-slate-100 mt-6">{pendingApplications.length}</p>
          <p className="text-slate-700 dark:text-slate-300 text-sm md:text-base">Pending player requests</p>
        </article>
      </section>

      <section className="mx-auto max-w-[1320px] rounded-2xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 md:p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-2xl md:text-3xl font-semibold text-slate-900 dark:text-slate-100">Player Applications</h2>
          <span className="px-3 py-1 rounded-xl bg-amber-100 text-amber-800 text-sm font-semibold">
            {pendingApplications.length} pending
          </span>
        </div>

        <div className="space-y-3">
          {pendingApplications.length === 0 && (
            <p className="text-slate-600 dark:text-slate-400 text-base">No pending applications from players.</p>
          )}
          {isApplicationsLoading && (
            <p className="text-slate-600 dark:text-slate-400 text-base">Loading applications...</p>
          )}

          {pendingApplications.slice(0, 6).map((application) => {
            const player = users.find((u) => u.id === application.playerId);
            return (
              <article
                key={application.id}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
              >
                <div>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{player?.name || 'Player'}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{player?.email || 'No email available'}</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300 mt-2">
                    {application.displayDate}
                  </p>
                  <p className="text-sm text-slate-700 dark:text-slate-300">{application.sport}</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300">{application.displayLocation}</p>
                  {application.notes && (
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Notes: {application.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDeclineApplication(application.id, application.source)}
                    className="px-3 py-2 rounded-xl bg-rose-100 text-rose-700 text-sm font-semibold hover:bg-rose-200"
                  >
                    Decline
                  </button>
                  <button
                    onClick={() => handleApproveApplication(application.id, application.source)}
                    className="px-3 py-2 rounded-xl bg-emerald-100 text-emerald-700 text-sm font-semibold hover:bg-emerald-200"
                  >
                    Approve
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-[1320px] flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-2xl border border-slate-300/60 dark:border-slate-700 bg-[#d7dde0] dark:bg-slate-900 p-1 shadow-sm flex-wrap">
          <button
            onClick={() => setActiveTab('sessions')}
            className={`px-4 md:px-5 py-2 rounded-xl text-sm md:text-base transition-colors inline-flex items-center gap-2 ${
              activeTab === 'sessions' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold shadow-sm' : 'text-slate-700 dark:text-slate-300'
            }`}
          >
            <CalendarDays className="w-4 h-4" />
            Training Sessions
          </button>
          <button
            onClick={() => setActiveTab('students')}
            className={`px-4 md:px-5 py-2 rounded-xl text-sm md:text-base transition-colors inline-flex items-center gap-2 ${
              activeTab === 'students' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold shadow-sm' : 'text-slate-700 dark:text-slate-300'
            }`}
          >
            <Users className="w-4 h-4" />
            My Students
          </button>
          <button
            onClick={() => setActiveTab('schedule')}
            className={`px-4 md:px-5 py-2 rounded-xl text-sm md:text-base transition-colors inline-flex items-center gap-2 ${
              activeTab === 'schedule' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold shadow-sm' : 'text-slate-700 dark:text-slate-300'
            }`}
          >
            <Calendar className="w-4 h-4" />
            Schedule
          </button>
        </div>

        <button
          onClick={() => navigate('/coach-sessions')}
          className="inline-flex items-center gap-2 px-4 md:px-6 py-2.5 md:py-3 rounded-2xl bg-teal-600 text-white text-sm md:text-base font-semibold hover:bg-teal-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4 md:w-5 md:h-5" />
          Create Session
        </button>
      </section>

      {activeTab === 'sessions' && (
        <section className="mx-auto max-w-[1320px] grid grid-cols-1 xl:grid-cols-2 gap-5">
          {sessionCards.length === 0 && (
            <div className="xl:col-span-2 rounded-2xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-slate-600 dark:text-slate-400 text-base">
              No upcoming training sessions yet.
            </div>
          )}

          {sessionCards.map((session) => {
            const meta = COURT_META[session.courtId] || {
              location: 'Training Court',
              sport: 'Training',
              image: '/tennis.png',
            };
            const courtName = courts.find((c) => c.id === session.courtId)?.name || 'Training Court';

            return (
              <article key={session.id} className="rounded-2xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
                <img src={meta.image} alt={courtName} className="w-full h-52 object-cover" />

                <div className="p-5 space-y-4">
                  <h3 className="text-2xl md:text-3xl font-semibold text-slate-900 dark:text-slate-100 leading-tight">{courtName}</h3>

                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="px-3 py-1 rounded-xl bg-[#b6f0a5] text-slate-900 dark:text-slate-100 text-sm md:text-base font-medium">{meta.sport}</span>
                    <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300 text-sm md:text-base">
                      <MapPin className="w-4 h-4" />
                      {meta.location}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 p-3">
                      <p className="text-slate-500 dark:text-slate-400 text-xs uppercase inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        Date
                      </p>
                      <p className="text-slate-900 dark:text-slate-100 text-base md:text-lg font-semibold mt-1">{format(session.date, 'MMM dd')}</p>
                      <p className="text-slate-700 dark:text-slate-300 text-sm">{format(session.date, 'yyyy')}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 p-3">
                      <p className="text-slate-500 dark:text-slate-400 text-xs uppercase inline-flex items-center gap-1">
                        <Clock3 className="w-3.5 h-3.5" />
                        Time
                      </p>
                      <p className="text-slate-900 dark:text-slate-100 text-base md:text-lg font-semibold mt-1">{session.startTime}</p>
                      <p className="text-slate-700 dark:text-slate-300 text-sm">{Math.round(session.duration / 60)}h</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 p-3">
                      <p className="text-slate-500 dark:text-slate-400 text-xs uppercase inline-flex items-center gap-1">
                        <UserCheck className="w-3.5 h-3.5" />
                        Students
                      </p>
                      <p className="text-slate-900 dark:text-slate-100 text-base md:text-lg font-semibold mt-1">{getSessionStudentIds(session).length}/{session.maxPlayers || 4}</p>
                      <p className="text-slate-700 dark:text-slate-300 text-sm">enrolled</p>
                    </div>
                  </div>

                  <p className="text-slate-600 dark:text-slate-400 text-sm md:text-base min-h-[44px]">
                    {session.notes || 'Training session details and focus points can be updated in session manager.'}
                  </p>

                  <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <div className="text-xl md:text-2xl font-semibold text-emerald-700">PHP {session.amount.toFixed(0)}</div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigate('/coach-sessions')}
                        className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 inline-flex items-center justify-center"
                        aria-label="Edit session"
                      >
                        <Pencil className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                      </button>
                      <button
                        onClick={() => navigate('/coach-sessions')}
                        className="w-9 h-9 rounded-xl bg-rose-100 hover:bg-rose-200 inline-flex items-center justify-center"
                        aria-label="Delete session"
                      >
                        <Trash2 className="w-4 h-4 text-rose-700" />
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {activeTab === 'students' && (
        <section className="mx-auto max-w-[1320px] grid grid-cols-1 xl:grid-cols-2 gap-5">
          {studentCards.length === 0 && (
            <div className="xl:col-span-2 rounded-2xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-slate-600 dark:text-slate-400 text-base">
              No students enrolled yet.
            </div>
          )}

          {studentCards.map((student, index) => (
            <article key={student.id} className="rounded-2xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 md:p-6 shadow-sm space-y-5 min-h-[330px]">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 md:w-16 md:h-16 rounded-full border-2 border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center shrink-0">
                  {student.avatar ? (
                    <img src={student.avatar} alt={student.name} className="w-full h-full object-cover" />
                  ) : (
                    <UserRound className="w-8 h-8 text-slate-500 dark:text-slate-400" />
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-2xl md:text-3xl font-semibold text-slate-900 dark:text-slate-100 leading-tight truncate">{student.name}</h3>
                  <p className="text-slate-700 dark:text-slate-300 text-sm md:text-base truncate">{student.email}</p>
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-base md:text-lg text-slate-800 dark:text-slate-300">Sport:</span>
                  <span className="px-3 py-1 rounded-xl bg-[#b6f0a5] text-slate-900 dark:text-slate-100 text-sm md:text-base font-semibold">{student.primarySport}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-base md:text-lg text-slate-800 dark:text-slate-300">Level:</span>
                  <span className="px-3 py-1 rounded-xl bg-slate-100 border border-slate-300 text-slate-800 dark:text-slate-300 text-sm md:text-base font-semibold capitalize">{student.level}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-base md:text-lg text-slate-800 dark:text-slate-300">Sessions:</span>
                  <span className="text-base md:text-lg font-semibold text-slate-900 dark:text-slate-100">{student.sessions}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-base md:text-lg text-slate-800 dark:text-slate-300">Total Paid:</span>
                  <span className="text-base md:text-lg font-semibold text-slate-900 dark:text-slate-100">PHP {student.totalPaid.toFixed(0)}</span>
                </div>
              </div>

              <div>
                <div className="w-full h-3 bg-[#ddd3eb] rounded-full overflow-hidden">
                  <div className="h-full bg-[#1f5a5f] rounded-full" style={{ width: `${student.progress}%` }} />
                </div>
                <p className="text-slate-600 dark:text-slate-400 text-xs md:text-sm mt-2">{student.progress}% training progress • Student #{index + 1}</p>
              </div>
            </article>
          ))}
        </section>
      )}

      {activeTab === 'schedule' && (
        <section className="mx-auto max-w-[1320px] rounded-2xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 md:p-6 shadow-sm">
          <h2 className="text-2xl md:text-3xl font-semibold text-slate-900 dark:text-slate-100 mb-4">Upcoming Schedule</h2>
          <div className="space-y-3">
            {scheduleCards.length === 0 && <p className="text-slate-600 dark:text-slate-400 text-base">No schedule yet.</p>}
            {scheduleCards.map((session) => {
              const courtName = courts.find((c) => c.id === session.courtId)?.name || 'Training Court';
              return (
                <div key={session.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="text-slate-900 dark:text-slate-100 text-lg md:text-xl font-semibold">{courtName}</p>
                    <p className="text-slate-700 dark:text-slate-300 text-sm md:text-base">{format(session.date, 'EEEE, MMM dd yyyy')}</p>
                  </div>
                  <div className="inline-flex items-center gap-2 text-slate-800 dark:text-slate-300 text-sm md:text-base font-medium">
                    <Calendar className="w-4 h-4" />
                    {session.startTime} ({Math.round(session.duration / 60)}h)
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}


