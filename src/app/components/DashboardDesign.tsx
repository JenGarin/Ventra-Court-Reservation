import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { toast } from 'sonner';
import { CalendarDays, ChevronDown, MapPin, Search } from 'lucide-react';

type SportType = 'all' | 'basketball' | 'tennis' | 'pickle ball';

const COURT_META: Record<
  string,
  {
    location: string;
    sport: Exclude<SportType, 'all'>;
    image: string;
    status: 'Available' | 'Limited' | 'Few Slots';
    tags: string[];
  }
> = {
  c1: {
    location: 'Downtown Sports Complex',
    sport: 'basketball',
    image: '/basketball.png',
    status: 'Available',
    tags: ['indoor', 'air conditioning', 'lighting', 'scoreboard'],
  },
  c2: {
    location: 'Riverside Park',
    sport: 'tennis',
    image: '/tennis.png',
    status: 'Limited',
    tags: ['outdoor', 'lighting', 'net included', 'hard court'],
  },
  c3: {
    location: 'Elite Sports Hub',
    sport: 'pickle ball',
    image: '/pickle ball.png',
    status: 'Few Slots',
    tags: ['indoor', 'hard court', 'lighting', 'net included'],
  },
};

const statusClass: Record<'Available' | 'Limited' | 'Few Slots', string> = {
  Available: 'bg-lime-400/80 text-slate-900 border border-lime-200',
  Limited: 'bg-lime-300/70 text-slate-900 border border-lime-200',
  'Few Slots': 'bg-rose-300/70 text-slate-900 border border-rose-200',
};

export function DashboardDesign() {
  const { courts, currentUser } = useApp();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [selectedSport, setSelectedSport] = useState<SportType>('all');

  const heroCopy = useMemo(() => {
    if (currentUser?.role === 'coach') {
      return {
        eyebrow: 'Coach Corner',
        title: 'Shape Great Sessions, One Court at a Time',
        subtitle: 'Plan drills, book your court, and keep your athletes game-ready.',
      };
    }

    if (currentUser?.role === 'player') {
      return {
        eyebrow: 'Player Zone',
        title: 'Your Next Great Game Starts Here',
        subtitle: 'Find the right court, lock your schedule, and play your best.',
      };
    }

    return {
      eyebrow: 'Court Reservations',
      title: 'Book Your Next Session',
      subtitle: 'Browse active courts, filter by sport, and reserve in one click.',
    };
  }, [currentUser?.role]);

  const activeCourts = useMemo(() => courts.filter((court) => court.status === 'active'), [courts]);

  const filteredCourts = useMemo(() => {
    return activeCourts.filter((court) => {
      const meta = COURT_META[court.id] || {
        location: court.name,
        sport: 'basketball' as const,
      };
      const normalizedSearch = search.trim().toLowerCase();
      const matchesSearch =
        !normalizedSearch ||
        court.name.toLowerCase().includes(normalizedSearch) ||
        meta.location.toLowerCase().includes(normalizedSearch);
      const matchesSport = selectedSport === 'all' || meta.sport === selectedSport;
      return matchesSearch && matchesSport;
    });
  }, [activeCourts, search, selectedSport]);

  const handleQuickBook = (courtId: string) => {
    if (!currentUser) {
      toast.error('Please sign in to continue.');
      return;
    }

    navigate('/booking', {
      state: { prefillCourtId: courtId },
    });
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#eef8f8_0%,#d6e8e9_45%,#c8dcde_100%)] dark:bg-[radial-gradient(circle_at_top,#0f172a_0%,#0b1324_45%,#020617_100%)] -mx-4 -my-6 p-4 pb-10 sm:-mx-6 sm:p-6 md:-m-8 md:p-8 md:pb-12">
      <div className="mx-auto max-w-[1560px]">
        <section className="rounded-3xl border border-teal-100/80 dark:border-slate-700 bg-white/75 dark:bg-slate-900/75 p-4 shadow-[0_16px_50px_rgba(15,75,73,0.12)] backdrop-blur-sm sm:p-5 md:p-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700 dark:text-teal-300">{heroCopy.eyebrow}</p>
              <h1 className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-slate-100 sm:text-3xl md:text-4xl">{heroCopy.title}</h1>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 md:text-base">
                {heroCopy.subtitle}
              </p>
            </div>
            <div className="rounded-2xl border border-teal-200/80 dark:border-teal-800 bg-teal-50/70 dark:bg-teal-900/30 px-4 py-3 text-sm font-medium text-teal-900 dark:text-teal-200">
              {filteredCourts.length} court{filteredCourts.length === 1 ? '' : 's'} available
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-[1fr_260px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" size={22} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search courts or locations..."
                className="h-14 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-14 pr-4 text-base text-slate-700 dark:text-slate-200 shadow-sm outline-none transition-colors focus:border-teal-500"
              />
            </div>
            <div className="relative">
              <select
                value={selectedSport}
                onChange={(e) => setSelectedSport(e.target.value as SportType)}
                className="h-14 w-full appearance-none rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-5 pr-12 text-base font-semibold text-slate-900 dark:text-slate-100 shadow-sm outline-none transition-colors focus:border-teal-500"
              >
                <option value="all">All Sports</option>
                <option value="basketball">Basketball</option>
                <option value="tennis">Tennis</option>
                <option value="pickle ball">Pickle Ball</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-700 dark:text-slate-300" />
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-2">
          {filteredCourts.map((court) => {
            const meta = COURT_META[court.id] || {
              location: court.name,
              sport: 'basketball' as const,
              image: '/basketball.png',
              status: 'Available' as const,
              tags: ['indoor'],
            };
            return (
              <article
                key={court.id}
                className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/85 dark:bg-slate-900/85 shadow-[0_8px_24px_rgba(15,23,42,0.08)] transition-all hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(15,23,42,0.14)] 2xl:grid 2xl:grid-cols-[44%_56%]"
              >
                <div className="relative h-52 overflow-hidden sm:h-56 md:h-60 2xl:h-full 2xl:min-h-[300px]">
                  <img
                    src={meta.image}
                    alt={court.name}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <span className={`absolute right-4 top-4 rounded-xl px-4 py-1 text-sm font-semibold ${statusClass[meta.status]}`}>
                    {meta.status}
                  </span>
                </div>
                <div className="flex h-full flex-col space-y-5 p-4 sm:p-5 md:p-6">
                  <h3 className="text-2xl font-extrabold leading-tight text-slate-900 dark:text-slate-100 sm:text-3xl">{court.name}</h3>
                  <p className="flex items-center gap-2 text-base text-slate-700 dark:text-slate-300">
                    <MapPin size={18} className="shrink-0" /> {meta.location}
                  </p>

                  <div className="space-y-3 text-base text-slate-700 dark:text-slate-300">
                    <div className="flex items-start justify-between gap-4">
                      <p className="font-semibold text-slate-600 dark:text-slate-400">Sport</p>
                      <span className="inline-flex rounded-lg bg-teal-100 dark:bg-teal-900/40 px-3 py-1 text-sm font-bold uppercase tracking-wide text-teal-800 dark:text-teal-200">
                        {meta.sport.replace(/\b\w/g, (m) => m.toUpperCase())}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <p className="font-semibold text-slate-600 dark:text-slate-400">Price</p>
                      <div className="text-right">
                        <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
                          ₱{Math.max(25, Math.round((court.hourlyRate || 0) / 20))}
                        </p>
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">per hour</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex min-h-[70px] flex-wrap content-start gap-2 pt-1">
                    {meta.tags.map((tag) => (
                      <span key={tag} className="rounded-full border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-1 text-sm text-slate-700 dark:text-slate-300">
                        {tag}
                      </span>
                    ))}
                  </div>

                  <button
                    onClick={() => handleQuickBook(court.id)}
                    className="mt-auto flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-teal-700 text-base font-bold text-white transition-colors hover:bg-teal-800"
                  >
                    <CalendarDays size={18} />
                    Book Now
                  </button>
                </div>
              </article>
            );
          })}
        </section>

        {filteredCourts.length === 0 && (
          <div className="mt-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/70 p-8 text-center text-slate-600 dark:text-slate-400">
            No courts found. Try a different search or sport filter.
          </div>
        )}
      </div>
    </div>
  );
}
