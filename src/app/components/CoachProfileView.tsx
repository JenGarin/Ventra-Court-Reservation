import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { CalendarDays, Clock3, Mail, Phone, UserCircle2, Award, Users, ClipboardList, BadgeCheck } from 'lucide-react';
import { format, startOfToday } from 'date-fns';

export function CoachProfileView() {
  const { currentUser, bookings } = useApp();
  const navigate = useNavigate();

  const coachSessions = useMemo(
    () =>
      bookings
        .filter((b) => b.userId === currentUser?.id && b.type === 'training' && b.status !== 'cancelled')
        .sort((a, b) => a.date.getTime() - b.date.getTime()),
    [bookings, currentUser]
  );

  const today = startOfToday();
  const upcomingSessions = coachSessions.filter((s) => s.date >= today);
  const completedSessions = coachSessions.filter((s) => s.date < today);

  const totalStudents = useMemo(() => {
    const allStudentIds = new Set<string>();
    coachSessions.forEach((s) => (s.players || []).forEach((id) => allStudentIds.add(id)));
    return allStudentIds.size;
  }, [coachSessions]);

  const nextSession = upcomingSessions[0];

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-300">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Coach Profile</h1>
        <p className="text-slate-600 dark:text-slate-300">Your account overview, coaching activity, and quick actions.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center overflow-hidden border border-teal-200">
                  {currentUser?.avatar ? (
                    <img src={currentUser.avatar} alt={currentUser.name || 'Coach'} className="w-full h-full object-cover" />
                  ) : (
                    <UserCircle2 className="w-10 h-10" />
                  )}
                </div>
                <div>
                  <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{currentUser?.name || 'Coach Profile'}</h2>
                  <p className="text-slate-500 dark:text-slate-400 capitalize">Role: {currentUser?.role || 'coach'}</p>
                  <div className="mt-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase ${
                        currentUser?.coachVerificationStatus === 'verified'
                          ? 'bg-emerald-100 text-emerald-700'
                          : currentUser?.coachVerificationStatus === 'pending'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      <BadgeCheck className="w-3.5 h-3.5" />
                      {currentUser?.coachVerificationStatus || 'unverified'}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-600 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5">
                      <Mail className="w-4 h-4" />
                      {currentUser?.email || 'No email'}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="w-4 h-4" />
                      {currentUser?.phone || 'No phone number'}
                    </span>
                    <span className="inline-flex items-center gap-1.5 capitalize">
                      <Award className="w-4 h-4" />
                      {currentUser?.skillLevel || 'intermediate'}
                    </span>
                  </div>
                  {(currentUser?.coachVerificationMethod || currentUser?.coachVerificationId) && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                      Verification: {currentUser?.coachVerificationMethod || 'credential'}{currentUser?.coachVerificationId ? ` (${currentUser.coachVerificationId})` : ''}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => navigate('/profile-settings')}
                className="self-start md:self-auto px-4 py-2.5 rounded-xl bg-teal-600 text-white hover:bg-teal-700 transition-colors font-medium"
              >
                Edit Profile
              </button>
            </div>
          </section>

          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Coaching Overview</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Upcoming Sessions</p>
                <p className="text-3xl font-semibold text-slate-900 dark:text-slate-100 mt-1">{upcomingSessions.length}</p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Completed Sessions</p>
                <p className="text-3xl font-semibold text-slate-900 dark:text-slate-100 mt-1">{completedSessions.length}</p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Students Coached</p>
                <p className="text-3xl font-semibold text-slate-900 dark:text-slate-100 mt-1">{totalStudents}</p>
              </div>
            </div>
          </section>

          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Next Session</h3>
            {nextSession ? (
              <div className="space-y-2 text-slate-700 dark:text-slate-300">
                <p className="inline-flex items-center gap-2">
                  <CalendarDays className="w-4 h-4" />
                  {format(nextSession.date, 'EEEE, MMM d, yyyy')}
                </p>
                <p className="inline-flex items-center gap-2">
                  <Clock3 className="w-4 h-4" />
                  {nextSession.startTime} - {nextSession.endTime}
                </p>
                <p className="inline-flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  {(nextSession.players || []).length}/{nextSession.maxPlayers || 4} students enrolled
                </p>
                {nextSession.notes && (
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                    {nextSession.notes}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-slate-500 dark:text-slate-400">No upcoming session scheduled.</p>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="bg-teal-600 rounded-2xl p-6 text-white shadow-lg shadow-teal-200/30">
            <h3 className="font-bold text-lg mb-2">Coach Toolkit</h3>
            <p className="text-teal-100 text-sm mb-4">Manage your sessions and keep your students on track.</p>
            <button
              onClick={() => navigate('/coach-sessions')}
              className="w-full bg-white text-teal-700 py-2.5 rounded-lg font-semibold hover:bg-teal-50 transition-colors"
            >
              Open Session Manager
            </button>
          </section>

          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Coach Actions</h3>
            <div className="space-y-2">
              <button
                onClick={() => navigate('/coach-sessions')}
                className="w-full text-left p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 inline-flex items-center gap-2"
              >
                <ClipboardList className="w-4 h-4" />
                Manage My Sessions
              </button>
              <button
                onClick={() => navigate('/booking')}
                className="w-full text-left p-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 inline-flex items-center gap-2"
              >
                <CalendarDays className="w-4 h-4" />
                Book a Court
              </button>
            </div>
          </section>

          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Coach Notes</h3>
            <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <li>Keep session notes updated for each training block.</li>
              <li>Mark attendance right after each session.</li>
              <li>Use profile settings to keep your contact details current.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
