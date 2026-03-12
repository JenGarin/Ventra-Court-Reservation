import { useState } from 'react';
import { Calendar, dateFnsLocalizer, Event, SlotInfo } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, addMinutes } from 'date-fns';
import enUS from 'date-fns/locale/en-US';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useApp } from '@/context/AppContext';
import { X, Calendar as CalendarIcon, Clock } from 'lucide-react';
import { toast } from 'sonner';

const locales = {
  'en-US': enUS,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

export default function BookingCalendar() {
  const { bookings, courts, users, createBooking, currentUser } = useApp();
  const [selectedCourt, setSelectedCourt] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<SlotInfo | null>(null);
  const [bookingType, setBookingType] = useState('private');
  const [bookingCourtId, setBookingCourtId] = useState<string>('');

  const events: Event[] = bookings.map((booking) => {
    const date = new Date(booking.date);
    const [startHour, startMinute] = booking.startTime.split(':').map(Number);
    const [endHour, endMinute] = booking.endTime.split(':').map(Number);

    const start = new Date(date);
    start.setHours(startHour, startMinute, 0, 0);

    const end = new Date(date);
    end.setHours(endHour, endMinute, 0, 0);

    const user = users.find((u) => u.id === booking.userId);
    const title = user ? `${user.name} (${booking.type})` : booking.type;

    return {
      title,
      start,
      end,
      resource: { courtId: booking.courtId },
    };
  });

  const handleSelectSlot = (slotInfo: SlotInfo) => {
    if (!currentUser) {
      toast.error('Please log in to book a court.');
      return;
    }
    setSelectedSlot(slotInfo);
    const initialCourtId =
      (slotInfo.resourceId as string) ||
      (selectedCourt !== 'all' ? selectedCourt : courts[0]?.id);
    setBookingCourtId(initialCourtId);
    setIsModalOpen(true);
  };

  const handleConfirmBooking = () => {
    if (!selectedSlot || !currentUser || !bookingCourtId) return;

    const court = courts.find((c) => c.id === bookingCourtId);
    const duration = (selectedSlot.end.getTime() - selectedSlot.start.getTime()) / (1000 * 60);

    createBooking({
      courtId: bookingCourtId,
      userId: currentUser.id,
      type: bookingType as any,
      date: selectedSlot.start,
      startTime: format(selectedSlot.start, 'HH:mm'),
      endTime: format(selectedSlot.end, 'HH:mm'),
      duration,
      status: 'confirmed',
      paymentStatus: 'pending',
      amount: court ? (court.hourlyRate * duration) / 60 : 0,
      checkedIn: false,
    });

    toast.success('Booking confirmed!');
    setIsModalOpen(false);
    setSelectedSlot(null);
  };

  // Filter events by selected court
  const filteredEvents =
    selectedCourt === 'all'
      ? events
      : events.filter((e) => e.resource?.courtId === selectedCourt);

  return (
    <>
    <div className="bg-white rounded-2xl shadow-xl p-6">
      <div className="flex items-center gap-4 mb-4">
        <label className="font-semibold">Court:</label>
        <select
          value={selectedCourt}
          onChange={(e) => setSelectedCourt(e.target.value)}
          className="border rounded px-2 py-1"
        >
          <option value="all">All Courts</option>
          {courts.map((court) => (
            <option key={court.id} value={court.id}>
              {court.name}
            </option>
          ))}
        </select>
      </div>
      <Calendar
        localizer={localizer}
        events={filteredEvents}
        startAccessor="start"
        endAccessor="end"
        style={{ height: 600 }}
        selectable
        onSelectSlot={handleSelectSlot}
        views={['week', 'day']}
        defaultView="week"
        step={30}
        timeslots={2}
        resources={courts}
        resourceIdAccessor="id"
        resourceTitleAccessor="name"
      />
    </div>

    {isModalOpen && selectedSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900">Confirm Booking</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X size={20} className="text-slate-500" />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                <CalendarIcon size={20} className="text-teal-600" />
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase">Date</p>
                  <p className="font-medium text-slate-900">
                    {format(selectedSlot.start, 'MMMM do, yyyy')}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                <Clock size={20} className="text-teal-600" />
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase">Time</p>
                  <p className="font-medium text-slate-900">
                    {format(selectedSlot.start, 'HH:mm')} - {format(selectedSlot.end, 'HH:mm')}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Court</label>
                <select
                  value={bookingCourtId}
                  onChange={(e) => setBookingCourtId(e.target.value)}
                  className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                >
                  {courts.map((court) => (
                    <option key={court.id} value={court.id}>{court.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Booking Type</label>
                <select
                  value={bookingType}
                  onChange={(e) => setBookingType(e.target.value)}
                  className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                >
                  <option value="private">Private Session</option>
                  <option value="open_play">Open Play</option>
                  <option value="training">Training</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setIsModalOpen(false)}
                className="flex-1 py-3 text-slate-600 font-bold hover:bg-slate-50 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmBooking}
                className="flex-1 py-3 bg-teal-600 text-white font-bold rounded-xl hover:bg-teal-700 transition-colors shadow-lg shadow-teal-200"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
