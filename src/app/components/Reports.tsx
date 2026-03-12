import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns';
import { Calendar, TrendingUp, DollarSign, Activity, Download } from 'lucide-react';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { BookingAnalytics } from '@/types';
import { backendApi } from '@/context/backendApi';

export function Reports() {
  const { bookings, courts, currentUser, users, getCourtUtilization } = useApp();
  const usingBackendApi = backendApi.isEnabled;
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([
    startOfMonth(new Date()),
    endOfMonth(new Date())
  ]);
  const [startDate, endDate] = dateRange;
  const [selectedCourtId, setSelectedCourtId] = useState<string>('all');
  const [backendAnalytics, setBackendAnalytics] = useState<BookingAnalytics | null>(null);
  const [backendUtilizationData, setBackendUtilizationData] = useState<Array<{ name: string; hours: number }>>([]);
  const [isBackendAnalyticsLoading, setIsBackendAnalyticsLoading] = useState(false);
  const [isBackendUtilizationLoading, setIsBackendUtilizationLoading] = useState(false);
  const [backendAnalyticsError, setBackendAnalyticsError] = useState<string | null>(null);
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [isExportingAttendanceCsv, setIsExportingAttendanceCsv] = useState(false);

  const analytics = useMemo(() => {
    if (!startDate || !endDate) return null;
    
    const filtered = bookings.filter(b => {
      const dateMatch = new Date(b.date) >= startDate && new Date(b.date) <= endDate;
      const courtMatch = selectedCourtId === 'all' || b.courtId === selectedCourtId;
      return dateMatch && courtMatch;
    });

    const totalBookings = filtered.length;
    const completedBookings = filtered.filter((b) => b.status === 'completed').length;
    const cancelledBookings = filtered.filter((b) => b.status === 'cancelled').length;
    const noShows = filtered.filter((b) => b.status === 'no_show').length;
    const totalRevenue = filtered.reduce((sum, b) => sum + b.amount, 0);

    return {
      totalBookings,
      completedBookings,
      cancelledBookings,
      noShows,
      noShowRate: totalBookings > 0 ? (noShows / totalBookings) * 100 : 0,
      totalRevenue,
      averageBookingValue: totalBookings > 0 ? totalRevenue / totalBookings : 0,
    };
  }, [startDate, endDate, bookings, selectedCourtId]);

  useEffect(() => {
    let active = true;
    if (!usingBackendApi || !startDate || !endDate) {
      setBackendAnalytics(null);
      setBackendAnalyticsError(null);
      setIsBackendAnalyticsLoading(false);
      return;
    }
    setIsBackendAnalyticsLoading(true);
    setBackendAnalyticsError(null);
    backendApi
      .getBookingAnalytics(startDate, endDate, selectedCourtId === 'all' ? {} : { courtId: selectedCourtId })
      .then((data) => {
        if (!active) return;
        setBackendAnalytics(data);
      })
      .catch(() => {
        if (!active) return;
        setBackendAnalytics(null);
        setBackendAnalyticsError('Failed to load analytics from backend.');
      })
      .finally(() => {
        if (!active) return;
        setIsBackendAnalyticsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [usingBackendApi, startDate, endDate, selectedCourtId]);

  const revenueData = useMemo(() => {
    if (!startDate || !endDate) return [];
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    return days.map(day => {
      const dayBookings = bookings.filter(b => 
        isSameDay(new Date(b.date), day) && 
        b.status !== 'cancelled' &&
        (selectedCourtId === 'all' || b.courtId === selectedCourtId)
      );
      return {
        date: format(day, 'MMM dd'),
        fullDate: format(day, 'yyyy-MM-dd'),
        revenue: dayBookings.reduce((sum, b) => sum + b.amount, 0),
        bookings: dayBookings.length
      };
    });
  }, [startDate, endDate, bookings, selectedCourtId]);

  const utilizationData = useMemo(() => {
    if (!startDate || !endDate) return [];
    const targetCourts = selectedCourtId === 'all' ? courts : courts.filter(c => c.id === selectedCourtId);

    return targetCourts.map(court => {
      const courtBookings = bookings.filter(b => 
        b.courtId === court.id && 
        new Date(b.date) >= startDate && 
        new Date(b.date) <= endDate &&
        b.status !== 'cancelled'
      );
      const totalHours = courtBookings.reduce((sum, b) => sum + (b.duration / 60), 0);
      return {
        name: court.name,
        hours: Math.round(totalHours * 10) / 10
      };
    });
  }, [startDate, endDate, bookings, courts, selectedCourtId]);

  useEffect(() => {
    let active = true;
    if (!usingBackendApi || !startDate || !endDate) {
      setBackendUtilizationData([]);
      setIsBackendUtilizationLoading(false);
      return;
    }
    setIsBackendUtilizationLoading(true);
    const targetCourts = selectedCourtId === 'all' ? courts : courts.filter((c) => c.id === selectedCourtId);
    if (targetCourts.length === 0) {
      setBackendUtilizationData([]);
      setIsBackendUtilizationLoading(false);
      return;
    }

    Promise.all(
      targetCourts.map(async (court) => {
        const rows = await getCourtUtilization(court.id, startDate, endDate);
        const totalHours = rows.reduce((sum, row) => sum + Number(row.hoursBooked || 0), 0);
        return {
          name: court.name,
          hours: Math.round(totalHours * 10) / 10,
        };
      })
    )
      .then((rows) => {
        if (!active) return;
        setBackendUtilizationData(rows);
      })
      .catch(() => {
        if (!active) return;
        setBackendUtilizationData([]);
      })
      .finally(() => {
        if (!active) return;
        setIsBackendUtilizationLoading(false);
      });

    return () => {
      active = false;
    };
  }, [usingBackendApi, startDate, endDate, selectedCourtId, courts, getCourtUtilization]);

  const effectiveAnalytics = useMemo(() => {
    if (usingBackendApi && backendAnalytics) return backendAnalytics;
    return analytics;
  }, [analytics, backendAnalytics, usingBackendApi]);

  const effectiveUtilizationData = useMemo(() => {
    if (usingBackendApi && backendUtilizationData.length > 0) return backendUtilizationData;
    return utilizationData;
  }, [backendUtilizationData, utilizationData, usingBackendApi]);

  const statusData = useMemo(() => {
    if (!effectiveAnalytics) return [];
    return [
      { name: 'Completed', value: effectiveAnalytics.completedBookings, color: '#10b981' },
      { name: 'Cancelled', value: effectiveAnalytics.cancelledBookings, color: '#ef4444' },
      { name: 'No Show', value: effectiveAnalytics.noShows, color: '#f59e0b' },
      { name: 'Upcoming', value: effectiveAnalytics.totalBookings - (effectiveAnalytics.completedBookings + effectiveAnalytics.cancelledBookings + effectiveAnalytics.noShows), color: '#3b82f6' }
    ].filter(item => item.value > 0);
  }, [effectiveAnalytics]);

  const revenueByTypeData = useMemo(() => {
    if (!startDate || !endDate) return [];
    const typeMap = new Map<string, number>();
    
    bookings.forEach(b => {
      if (new Date(b.date) >= startDate && 
          new Date(b.date) <= endDate && 
          b.status !== 'cancelled' &&
          (selectedCourtId === 'all' || b.courtId === selectedCourtId)
      ) {
        const type = b.type.charAt(0).toUpperCase() + b.type.slice(1).replace('_', ' ');
        const current = typeMap.get(type) || 0;
        typeMap.set(type, current + b.amount);
      }
    });

    const colors = ['#0d9488', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6'];

    return Array.from(typeMap.entries()).map(([name, value], index) => ({
      name,
      value,
      color: colors[index % colors.length]
    })).sort((a, b) => b.value - a.value);
  }, [startDate, endDate, bookings, selectedCourtId]);

  const topSpenders = useMemo(() => {
    if (!startDate || !endDate) return [];
    
    const spenderMap = new Map<string, number>();

    bookings.forEach(b => {
      if (new Date(b.date) >= startDate && 
          new Date(b.date) <= endDate && 
          b.status !== 'cancelled' &&
          (selectedCourtId === 'all' || b.courtId === selectedCourtId)
      ) {
        const current = spenderMap.get(b.userId) || 0;
        spenderMap.set(b.userId, current + b.amount);
      }
    });

    return Array.from(spenderMap.entries())
      .map(([userId, total]) => {
        const user = users.find(u => u.id === userId);
        return {
          name: user?.name || 'Unknown User',
          email: user?.email || '',
          total
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [startDate, endDate, bookings, selectedCourtId, users]);

  const handleExportCSV = async () => {
    if (usingBackendApi && startDate && endDate) {
      try {
        setIsExportingCsv(true);
        const { filename, csv } = await backendApi.exportBookingsCsv({
          startDate,
          endDate,
          courtId: selectedCourtId === 'all' ? undefined : selectedCourtId,
        });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      } catch {
        // Fallback to local export.
      } finally {
        setIsExportingCsv(false);
      }
    }

    if (!revenueData.length) return;
    
    const headers = ['Date', 'Revenue', 'Bookings'];
    const rows = revenueData.map(item => [item.fullDate, item.revenue, item.bookings]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'revenue_report.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportAttendanceCSV = async () => {
    if (usingBackendApi && startDate && endDate) {
      try {
        setIsExportingAttendanceCsv(true);
        const payload = await backendApi.exportAttendanceAnalytics({
          format: 'csv',
          startDate,
          endDate,
          courtId: selectedCourtId === 'all' ? undefined : selectedCourtId,
        });
        const csv = String(payload?.data || '');
        const filename = String(payload?.filename || `attendance_export_${format(new Date(), 'yyyy-MM-dd')}.csv`);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      } catch {
        // Fall back to local export below.
      } finally {
        setIsExportingAttendanceCsv(false);
      }
    }

    if (!startDate || !endDate) return;
    const rows: Array<[string, string, string, string, string, string, string, string, string]> = [];
    bookings
      .filter((b) => b.type === 'training')
      .filter((b) => new Date(b.date) >= startDate && new Date(b.date) <= endDate)
      .filter((b) => selectedCourtId === 'all' || b.courtId === selectedCourtId)
      .forEach((session) => {
        (session.players || []).forEach((playerId) => {
          rows.push([
            session.id,
            format(new Date(session.date), 'yyyy-MM-dd'),
            session.courtId,
            session.userId,
            playerId,
            '',
            session.playerAttendance?.[playerId] ? 'yes' : 'no',
            session.startTime,
            session.endTime,
          ]);
        });
      });

    const headers = ['sessionId', 'date', 'courtId', 'coachId', 'playerId', 'sport', 'attended', 'startTime', 'endTime'];
    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `attendance_export_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (currentUser?.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950">
        <div className="text-center">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Access Denied</h2>
          <p className="text-slate-500">You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }

  if (!startDate || !endDate || !effectiveAnalytics) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 p-6 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Analytics & Reports</h1>
          <p className="text-slate-500 dark:text-slate-400">Visualize performance metrics and booking trends.</p>
          {usingBackendApi && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {(isBackendAnalyticsLoading || isBackendUtilizationLoading) ? 'Syncing analytics from backend...' : 'Using backend analytics data.'}
            </p>
          )}
          {backendAnalyticsError && (
            <p className="text-xs text-rose-600 mt-1">{backendAnalyticsError}</p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-3 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
            <select 
              value={selectedCourtId}
              onChange={(e) => setSelectedCourtId(e.target.value)}
              className="bg-transparent border-none text-sm focus:ring-0 text-slate-700 dark:text-slate-200 font-medium outline-none py-2 px-3 min-w-[140px]"
            >
              <option value="all">All Courts</option>
              {courts.map(court => (
                <option key={court.id} value={court.id}>{court.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="px-3">
                  <Calendar size={18} className="text-slate-400" />
              </div>
              <DatePicker
                  selectsRange={true}
                  startDate={startDate}
                  endDate={endDate}
                  onChange={(update) => setDateRange(update)}
                  className="bg-transparent border-none text-sm focus:ring-0 w-56 text-slate-700 dark:text-slate-200 font-medium outline-none"
                  dateFormat="MMM dd, yyyy"
              />
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-teal-50 dark:bg-teal-900/20 rounded-xl text-teal-600 dark:text-teal-400">
                    <DollarSign size={24} />
                </div>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">+12%</span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Total Revenue</p>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">₱{effectiveAnalytics.totalRevenue.toLocaleString()}</h3>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-blue-600 dark:text-blue-400">
                    <Activity size={24} />
                </div>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">+5%</span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Total Bookings</p>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{effectiveAnalytics.totalBookings}</h3>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl text-purple-600 dark:text-purple-400">
                    <TrendingUp size={24} />
                </div>
                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-full">Avg</span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Avg. Booking Value</p>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">₱{Math.round(effectiveAnalytics.averageBookingValue)}</h3>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-rose-50 dark:bg-rose-900/20 rounded-xl text-rose-600 dark:text-rose-400">
                    <Activity size={24} />
                </div>
                <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded-full">{effectiveAnalytics.noShowRate.toFixed(1)}%</span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">No Show Rate</p>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{effectiveAnalytics.noShows}</h3>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Revenue Chart */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">Revenue Trend</h3>
            <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={revenueData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                        <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                        <Tooltip 
                            contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                        />
                        <Line type="monotone" dataKey="revenue" stroke="#0d9488" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>

        {/* Court Utilization */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">Court Utilization (Hours)</h3>
            <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={effectiveUtilizationData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
                        <XAxis type="number" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                        <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} width={100} />
                        <Tooltip 
                            cursor={{fill: 'transparent'}}
                            contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                        />
                        <Bar dataKey="hours" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={32} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
          {/* Booking Status Distribution */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">Booking Status</h3>
            <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={statusData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                        >
                            {statusData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Pie>
                        <Tooltip />
                        <Legend verticalAlign="bottom" height={36} />
                    </PieChart>
                </ResponsiveContainer>
            </div>
          </div>

          {/* Revenue by Type */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">Revenue by Type</h3>
            <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={revenueByTypeData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                        >
                            {revenueByTypeData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => `₱${value.toLocaleString()}`} />
                        <Legend verticalAlign="bottom" height={36} />
                    </PieChart>
                </ResponsiveContainer>
            </div>
          </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
          {/* Recent Activity Table */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
             <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Recent Transactions</h3>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleExportAttendanceCSV}
                    disabled={isExportingAttendanceCsv}
                    className="text-sm text-blue-600 font-medium hover:text-blue-700 flex items-center gap-1"
                  >
                    <Download size={16} /> {isExportingAttendanceCsv ? 'Exporting...' : 'Export Attendance'}
                  </button>
                  <button 
                      onClick={handleExportCSV}
                      disabled={isExportingCsv}
                      className="text-sm text-teal-600 font-medium hover:text-teal-700 flex items-center gap-1"
                  >
                      <Download size={16} /> {isExportingCsv ? 'Exporting...' : 'Export CSV'}
                  </button>
                </div>
             </div>
             <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800">
                            <th className="pb-3 text-xs font-bold text-slate-400 uppercase">Date</th>
                            <th className="pb-3 text-xs font-bold text-slate-400 uppercase">Description</th>
                            <th className="pb-3 text-xs font-bold text-slate-400 uppercase text-right">Amount</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {revenueData.slice(-5).reverse().map((item, i) => (
                            <tr key={i}>
                                <td className="py-3 text-sm text-slate-600 dark:text-slate-300">{item.date}</td>
                                <td className="py-3 text-sm text-slate-900 dark:text-white font-medium">Daily Revenue Summary</td>
                                <td className="py-3 text-sm text-slate-900 dark:text-white font-bold text-right">₱{item.revenue.toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
             </div>
          </div>

          {/* Top Spenders Table */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
             <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">Top Spenders</h3>
             <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800">
                            <th className="pb-3 text-xs font-bold text-slate-400 uppercase">User</th>
                            <th className="pb-3 text-xs font-bold text-slate-400 uppercase text-right">Total Spent</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {topSpenders.map((spender, i) => (
                            <tr key={i}>
                                <td className="py-3">
                                    <p className="text-sm font-bold text-slate-900 dark:text-white">{spender.name}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">{spender.email}</p>
                                </td>
                                <td className="py-3 text-sm text-slate-900 dark:text-white font-bold text-right">₱{spender.total.toLocaleString()}</td>
                            </tr>
                        ))}
                        {topSpenders.length === 0 && (
                            <tr>
                                <td colSpan={2} className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">No data available</td>
                            </tr>
                        )}
                    </tbody>
                </table>
             </div>
          </div>
      </div>
    </div>
  );
}
