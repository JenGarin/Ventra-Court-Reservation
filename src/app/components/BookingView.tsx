import BookingCalendar from './BookingCalendar';

export function BookingView() {
  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      <BookingCalendar />
    </div>
  );
}