import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Check, X, Clock, Calendar as CalendarIcon, User, AlertCircle, Search, Filter, MoreHorizontal } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Checkbox } from './ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";

export function PendingBookings() {
  const { bookings, users, courts, confirmBooking, cancelBooking } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [courtFilter, setCourtFilter] = useState('all');
  const [selectedBookings, setSelectedBookings] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([null, null]);
  const [startDate, endDate] = dateRange;
  const [confirmationModal, setConfirmationModal] = useState<{
    isOpen: boolean;
    type: 'approve' | 'reject' | 'bulk_approve' | 'bulk_reject' | null;
    bookingId: string | null;
    rejectionReason: string;
  }>({ isOpen: false, type: null, bookingId: null, rejectionReason: '' });

  const allPendingBookings = bookings.filter(b => b.status === 'pending');

  const filteredPendingBookings = allPendingBookings
    .filter(b => {
      const user = users.find(u => u.id === b.userId);
      const matchesSearch = !searchTerm || (user?.name || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCourt = courtFilter === 'all' || b.courtId === courtFilter;
      
      let matchesDate = true;
      if (startDate) {
        matchesDate = matchesDate && new Date(b.date) >= startDate;
      }
      if (endDate) {
        matchesDate = matchesDate && new Date(b.date) <= new Date(endDate.getTime() + 86400000 - 1);
      }

      return matchesSearch && matchesCourt && matchesDate;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedBookings(filteredPendingBookings.map(b => b.id));
    } else {
      setSelectedBookings([]);
    }
  };

  const handleSelectBooking = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedBookings(prev => [...prev, id]);
    } else {
      setSelectedBookings(prev => prev.filter(bookingId => bookingId !== id));
    }
  };

  const handleApprove = (id: string) => {
    setConfirmationModal({ isOpen: true, type: 'approve', bookingId: id, rejectionReason: '' });
  };

  const handleReject = (id: string) => {
    setConfirmationModal({ isOpen: true, type: 'reject', bookingId: id, rejectionReason: '' });
  };

  const handleBulkApprove = () => {
    if (selectedBookings.length === 0) return;
    setConfirmationModal({ isOpen: true, type: 'bulk_approve', bookingId: null, rejectionReason: '' });
  };

  const handleBulkReject = () => {
    if (selectedBookings.length === 0) return;
    setConfirmationModal({ isOpen: true, type: 'bulk_reject', bookingId: null, rejectionReason: '' });
  };

  const processConfirmation = async () => {
    const { type, bookingId, rejectionReason } = confirmationModal;
    if (!type) return;

    try {
      if (type === 'approve' && bookingId) {
        await confirmBooking(bookingId);
        toast.success('Booking approved successfully');
      } else if (type === 'reject' && bookingId) {
        await cancelBooking(bookingId, rejectionReason);
        toast.success('Booking rejected');
      } else if (type === 'bulk_approve') {
        await Promise.all(selectedBookings.map(id => confirmBooking(id)));
        toast.success(`${selectedBookings.length} bookings approved`);
        setSelectedBookings([]);
      } else if (type === 'bulk_reject') {
        await Promise.all(selectedBookings.map(id => cancelBooking(id, rejectionReason)));
        toast.success(`${selectedBookings.length} bookings rejected`);
        setSelectedBookings([]);
      }
    } catch (error) {
      toast.error(`Failed to process request`);
    } finally {
      setConfirmationModal({ isOpen: false, type: null, bookingId: null, rejectionReason: '' });
    }
  };

  if (allPendingBookings.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 border border-slate-200 dark:border-slate-800 shadow-sm text-center animate-in fade-in duration-500">
        <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
          <Check size={32} />
        </div>
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">All Caught Up!</h3>
        <p className="text-slate-500 dark:text-slate-400">There are no pending booking requests at the moment.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Pending Requests</h2>
          <p className="text-slate-500 dark:text-slate-400">Review and manage incoming booking requests.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search by user..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-teal-500 outline-none w-full md:w-64"
            />
          </div>
          
          <div className="relative z-10">
            <DatePicker
              selectsRange={true}
              startDate={startDate}
              endDate={endDate}
              onChange={(update) => setDateRange(update)}
              isClearable={true}
              placeholderText="Filter by date"
              className="pl-4 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-teal-500 outline-none w-full md:w-56"
            />
          </div>

          <Select value={courtFilter} onValueChange={setCourtFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by Court" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Courts</SelectItem>
              {courts.map(court => (
                <SelectItem key={court.id} value={court.id}>{court.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-xl text-sm font-bold flex items-center gap-2 whitespace-nowrap">
            <AlertCircle size={16} />
            {allPendingBookings.length} Pending
          </div>
        </div>
      </div>

      {selectedBookings.length > 0 && (
        <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-xl p-4 flex items-center justify-between animate-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-4">
            <span className="text-teal-900 dark:text-teal-300 font-medium">
              {selectedBookings.length} bookings selected
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleBulkReject}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              Reject Selected
            </Button>
            <Button 
              size="sm" 
              onClick={handleBulkApprove}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              Approve Selected
            </Button>
          </div>
        </div>
      )}

      {filteredPendingBookings.length === 0 && (searchTerm || courtFilter !== 'all' || startDate) && (
        <div className="text-center py-12 text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
          No pending requests found matching your filters.
        </div>
      )}

      {filteredPendingBookings.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center gap-4">
            <Checkbox 
              checked={selectedBookings.length === filteredPendingBookings.length && filteredPendingBookings.length > 0}
              onCheckedChange={handleSelectAll}
            />
            <span className="text-sm font-medium text-slate-500">Select All</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredPendingBookings.map((booking) => {
              const user = users.find(u => u.id === booking.userId);
              const court = courts.find(c => c.id === booking.courtId);
              const isSelected = selectedBookings.includes(booking.id);

              return (
                <div key={booking.id} className={`p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors ${isSelected ? 'bg-teal-50/30 dark:bg-teal-900/10' : ''}`}>
                  <div className="flex items-start gap-4">
                    <div className="pt-1">
                      <Checkbox 
                        checked={isSelected}
                        onCheckedChange={(checked) => handleSelectBooking(booking.id, checked as boolean)}
                      />
                    </div>
                    <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 shrink-0 overflow-hidden">
                      {user?.avatar ? (
                        <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                      ) : (
                        <User size={24} />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-900 dark:text-white text-lg">{user?.name || 'Unknown User'}</h3>
                        <Badge variant="secondary" className="capitalize">
                          {user?.role}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-x-6 gap-y-2 mt-2 text-sm text-slate-500 dark:text-slate-400">
                        <div className="flex items-center gap-2">
                          <CalendarIcon size={16} className="text-teal-600" />
                          {format(new Date(booking.date), 'EEEE, MMM dd, yyyy')}
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock size={16} className="text-teal-600" />
                          {booking.startTime} ({booking.duration} min)
                        </div>
                        <div className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
                          <span className="w-2 h-2 rounded-full bg-teal-500"></span>
                          {court?.name || 'Unknown Court'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 lg:self-center self-end border-t lg:border-t-0 border-slate-100 dark:border-slate-800 pt-4 lg:pt-0 w-full lg:w-auto justify-end">
                    <Button
                      variant="ghost"
                      onClick={() => handleReject(booking.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <X size={18} className="mr-2" />
                      Reject
                    </Button>
                    <Button
                      onClick={() => handleApprove(booking.id)}
                      className="bg-teal-600 hover:bg-teal-700 text-white shadow-lg shadow-teal-200 dark:shadow-none"
                    >
                      <Check size={18} className="mr-2" />
                      Approve
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmationModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200 p-6">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
              {confirmationModal.type?.includes('approve') ? 'Approve Booking' : 'Reject Booking'}
            </h3>
            <p className="text-slate-500 dark:text-slate-400 mb-6">
              {confirmationModal.type?.includes('bulk') 
                ? `Are you sure you want to ${confirmationModal.type?.split('_')[1]} ${selectedBookings.length} booking requests?`
                : `Are you sure you want to ${confirmationModal.type} this booking request?`
              }
            </p>
            {confirmationModal.type?.includes('reject') && (
              <div className="mt-4">
                <label htmlFor="rejectionReason" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Reason for Rejection (Optional)
                </label>
                <textarea
                  id="rejectionReason"
                  value={confirmationModal.rejectionReason}
                  onChange={(e) => setConfirmationModal(prev => ({ ...prev, rejectionReason: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none"
                  rows={3}
                  placeholder="e.g., Court is under maintenance."
                />
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <Button 
                variant="ghost"
                onClick={() => setConfirmationModal({ isOpen: false, type: null, bookingId: null, rejectionReason: '' })}
              >
                Cancel
              </Button>
              <Button 
                onClick={processConfirmation}
                className={confirmationModal.type?.includes('approve') ? 'bg-teal-600 hover:bg-teal-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}
              >
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
