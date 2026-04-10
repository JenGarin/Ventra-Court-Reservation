import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/context/AppContext';
import type { Booking } from '@/types';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  CircleCheck,
  MapPin,
  QrCode,
  CheckCircle2,
} from 'lucide-react';
import QRCode from 'react-qr-code';
import { format, isSameDay, parse } from 'date-fns';

const COURT_META: Record<string, { location: string; sport: string; image: string }> = {
  c1: { location: 'Downtown Sports Complex', sport: 'Basketball', image: '/basketball.png' },
  c2: { location: 'Riverside Park', sport: 'Tennis', image: '/tennis.png' },
  c3: { location: 'Elite Sports Hub', sport: 'Pickle Ball', image: '/pickle%20ball.png' },
};

export function CheckIn() {
  const { bookings, currentUser, courts, checkInBooking } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [showQr, setShowQr] = useState(false);

  const recentlyFromPayment = useMemo(() => {
    try {
      const ts = Number(sessionStorage.getItem('ventra_recent_payment_flow') || 0);
      return Boolean(ts && Date.now() - ts < 15_000);
    } catch {
      return false;
    }
  }, []);

  const [scanInput, setScanInput] = useState('');
  const [manualBookingId, setManualBookingId] = useState('');
  const [scannedBookingId, setScannedBookingId] = useState<string | null>(null);
  const [scanError, setScanError] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);

  const isStaffView = currentUser?.role === 'admin' || currentUser?.role === 'staff';
  const backFromState = typeof location.state?.from === 'string' ? location.state.from : '';
  const handleBackNavigation = () => {
    if (backFromState) {
      navigate(backFromState);
      return;
    }
    navigate(isStaffView ? '/dashboard' : '/profile');
  };

  const activeBooking = useMemo(() => {
    if (!currentUser) return null;

    const now = new Date();
    const userBookings = bookings
      .filter(
        (b) =>
          b.userId === currentUser.id &&
          b.status !== 'cancelled' &&
          b.status !== 'no_show' &&
          !b.checkedIn
      )
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    const todays = userBookings.filter((b) => isSameDay(new Date(b.date), now));
    if (todays.length > 0) return todays[0];

    const upcoming = userBookings.find((b) => new Date(b.date) >= now);
    return upcoming || null;
  }, [bookings, currentUser]);

  const [visibleBooking, setVisibleBooking] = useState<Booking | null>(() => activeBooking);

  useEffect(() => {
    const emptyDelayMs = recentlyFromPayment ? 8000 : 600;
    if (activeBooking) {
      setVisibleBooking(activeBooking);
      return;
    }
    const timeout = window.setTimeout(() => setVisibleBooking(null), emptyDelayMs);
    return () => window.clearTimeout(timeout);
  }, [activeBooking, recentlyFromPayment]);

  const qrValue = visibleBooking
    ? JSON.stringify({
        bookingId: visibleBooking.id,
        userId: visibleBooking.userId,
        courtId: visibleBooking.courtId,
        date: format(new Date(visibleBooking.date), 'yyyy-MM-dd'),
        startTime: visibleBooking.startTime,
        endTime: visibleBooking.endTime,
      })
    : 'NO_BOOKING';

  const bookingCourt = visibleBooking
    ? courts.find((c) => c.id === visibleBooking.courtId)
    : null;

  const courtName = bookingCourt
    ? bookingCourt.name
    : 'No booking selected';

  const formatTo12Hour = (time24: string) => {
    const parsed = parse(time24, 'HH:mm', new Date());
    return format(parsed, 'h:mm a').toLowerCase();
  };

  const bookingDateText = visibleBooking
    ? format(new Date(visibleBooking.date), 'EEEE, MMMM d, yyyy')
    : 'No booking date';

  const timeRange = visibleBooking
    ? `${formatTo12Hour(visibleBooking.startTime)} - ${formatTo12Hour(visibleBooking.endTime)}`
    : 'No booking schedule';

  const readBookingIdFromScan = (raw: string): string => {
    const value = raw.trim();
    if (!value) return '';

    if (value.startsWith('{') && value.endsWith('}')) {
      try {
        const parsed = JSON.parse(value) as { bookingId?: string; id?: string };
        if (parsed.bookingId) return parsed.bookingId;
        if (parsed.id) return parsed.id;
      } catch {
        return value;
      }
    }

    return value;
  };

  const verifyBookingId = (bookingId: string) => {
    const booking = bookings.find((b) => b.id.toLowerCase() === bookingId.toLowerCase());
    if (!booking) {
      setScannedBookingId(null);
      setScanError('Booking not found. Please scan a valid QR code.');
      return false;
    }

    setScannedBookingId(booking.id);
    setScanInput('');
    setManualBookingId('');
    setScanError('');
    return true;
  };

  const handleScan = () => {
    setScanError('');
    const bookingId = (manualBookingId || '').trim() || readBookingIdFromScan(scanInput);
    if (!bookingId) {
      setScanError('Enter scanned QR payload or manual booking ID.');
      return;
    }
    verifyBookingId(bookingId);
  };

  const stopCamera = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
  };

  const scanFromVideo = async () => {
    if (!videoRef.current || !detectorRef.current) return;
    try {
      const barcodes = await detectorRef.current.detect(videoRef.current);
      if (barcodes.length > 0 && barcodes[0].rawValue) {
        const rawValue = String(barcodes[0].rawValue);
        setScanInput(rawValue);
        const bookingId = readBookingIdFromScan(rawValue);
        verifyBookingId(bookingId);
        stopCamera();
        return;
      }
    } catch {
      // Ignore frame-level detect errors and continue scanning.
    }
    rafRef.current = requestAnimationFrame(scanFromVideo);
  };

  const openCameraScanner = async () => {
    setCameraError('');
    setScanError('');
    const BarcodeDetectorCtor = (window as any).BarcodeDetector;
    if (!BarcodeDetectorCtor) {
      setCameraError('Camera QR scanning is not supported in this browser.');
      return;
    }

    try {
      detectorRef.current = new BarcodeDetectorCtor({ formats: ['qr_code'] });
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      });
      streamRef.current = stream;
      setCameraOpen(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      rafRef.current = requestAnimationFrame(scanFromVideo);
    } catch {
      setCameraError('Unable to open camera. Check camera permissions and try again.');
    }
  };

  const handleUploadQrImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setCameraError('');
    setScanError('');
    const file = event.target.files?.[0];
    if (!file) return;

    const BarcodeDetectorCtor = (window as any).BarcodeDetector;
    if (!BarcodeDetectorCtor) {
      setCameraError('QR image decoding is not supported in this browser.');
      return;
    }

    try {
      detectorRef.current = new BarcodeDetectorCtor({ formats: ['qr_code'] });
      const bitmap = await createImageBitmap(file);
      const barcodes = await detectorRef.current.detect(bitmap);
      if (!barcodes.length || !barcodes[0].rawValue) {
        setScanError('No QR code found in the uploaded image.');
      } else {
        const rawValue = String(barcodes[0].rawValue);
        setScanInput(rawValue);
        const bookingId = readBookingIdFromScan(rawValue);
        verifyBookingId(bookingId);
      }
      bitmap.close();
    } catch {
      setScanError('Failed to read QR from image. Please upload a clearer QR image.');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const scannedBooking = useMemo(() => {
    if (!scannedBookingId) return null;
    return bookings.find((b) => b.id === scannedBookingId) || null;
  }, [bookings, scannedBookingId]);

  const scannedCourt = scannedBooking
    ? courts.find((c) => c.id === scannedBooking.courtId)
    : null;

  const scannedCourtName = scannedCourt
    ? scannedCourt.name
    : 'Unknown Court';

  const scannedMeta = scannedCourt ? COURT_META[scannedCourt.id] : null;

  const reservationFee = 10;
  const durationHours = scannedBooking ? scannedBooking.duration / 60 : 0;
  const ratePerHour = scannedBooking && durationHours > 0 ? scannedBooking.amount / durationHours : 0;
  const totalWithFee = scannedBooking ? scannedBooking.amount + reservationFee : 0;

  const handleConfirmCheckIn = async () => {
    if (!scannedBooking || scannedBooking.checkedIn) return;
    await checkInBooking(scannedBooking.id);
  };

  if (isStaffView) {
    return (
      <div className="min-h-screen bg-[#1f3a3c] text-slate-100 p-4 md:p-6 lg:p-8">
        <main className="max-w-7xl mx-auto space-y-5">
          <section className="rounded-3xl border border-white/10 bg-gradient-to-r from-[#2a4e52] to-[#326067] px-5 py-5">
            <div className="flex items-center gap-4">
              <img src="/ventra-logo.png" alt="Ventra" className="h-11 w-auto" />
              <div className="min-w-0">
                <h1 className="text-xl md:text-2xl font-semibold tracking-tight">Check-In Validation Center</h1>
                <p className="text-sm text-slate-200">Scan a QR code or enter a booking ID to verify player access.</p>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-[#294d52] p-4 md:p-5 space-y-4 shadow-xl shadow-black/10">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <button
                  onClick={handleBackNavigation}
                  className="mt-0.5 p-2 rounded-full hover:bg-white/10 transition-colors"
                  aria-label="Back"
                >
                  <ArrowLeft className="w-6 h-6" />
                </button>
                <div>
                  <h2 className="text-lg md:text-xl font-semibold">Scan Booking QR</h2>
                  <p className="text-sm text-slate-200">Use camera, upload QR image, or enter booking ID manually.</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={openCameraScanner}
                className="rounded-xl bg-teal-600 px-4 py-3 text-white font-semibold hover:bg-teal-700 transition-colors"
              >
                Open Camera
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 font-semibold hover:bg-slate-50 transition-colors"
              >
                Upload QR Code
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleUploadQrImage}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr,auto] gap-3 items-center">
              <input
                type="text"
                value={manualBookingId}
                onChange={(e) => setManualBookingId(e.target.value)}
                placeholder="Manual booking ID"
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
              />
              <button
                type="button"
                onClick={handleScan}
                className="rounded-xl bg-slate-900 px-5 py-3 text-white font-semibold hover:bg-slate-800"
              >
                Verify ID
              </button>
            </div>

            {scanInput && <p className="text-xs text-slate-200">Scanned QR detected and processed.</p>}

            {scanError && <p className="text-rose-200 text-sm">{scanError}</p>}
            {cameraError && <p className="text-amber-200 text-sm">{cameraError}</p>}

            {cameraOpen && (
              <div className="rounded-2xl border border-slate-300/40 bg-slate-900/80 p-4 w-full max-w-3xl">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-slate-100">Point the camera at a QR code.</p>
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="rounded-lg border border-slate-500 px-3 py-1 text-slate-100 text-sm hover:bg-white/10"
                  >
                    Close Camera
                  </button>
                </div>
                <video ref={videoRef} className="w-full rounded-xl bg-black" playsInline muted />
              </div>
            )}
          </section>

          {scannedBooking && scannedCourt && (
            <div className="grid grid-cols-1 xl:grid-cols-[1.15fr,0.85fr] gap-6">
              <div className="space-y-6">
                <section className="bg-[#f2f4f5] rounded-3xl p-6 border border-slate-300 text-slate-900 shadow-md">
                  <h2 className="text-2xl md:text-3xl font-semibold mb-4">Booking Details</h2>
                  <p className="text-base md:text-lg mb-5">
                    Booking Reference No.: BK-{format(new Date(scannedBooking.date), 'yyyyMMdd')}-{scannedBooking.id.slice(0, 4).toUpperCase()}
                  </p>

                  <h3 className="text-xl md:text-2xl font-semibold mb-3">Check In</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 gap-x-5 text-base md:text-lg">
                    <p>{format(new Date(scannedBooking.date), 'EEEE d MMM yyyy')}</p>
                    <p>Time: {formatTo12Hour(scannedBooking.startTime)} - {formatTo12Hour(scannedBooking.endTime)}</p>
                    <p>Total Duration: {durationHours} {durationHours === 1 ? 'Hour' : 'Hours'}</p>
                    <p>No. of Players: {Math.max(1, scannedBooking.players?.length || 1)} players</p>
                  </div>

                  <div className="mt-6 text-base md:text-lg flex items-center gap-2.5">
                    <span className="font-semibold">Booking status:</span>
                    <span className="inline-flex items-center gap-2 text-slate-700">
                      <CheckCircle2 className="w-4 h-4" />
                      {scannedBooking.checkedIn ? 'Checked In' : 'Confirmed'}
                    </span>
                  </div>
                </section>

                <section className="bg-[#f2f4f5] rounded-3xl p-6 border border-slate-300 text-slate-900 shadow-md">
                  <h3 className="text-2xl md:text-3xl font-semibold mb-5">Payment Summary</h3>
                  <div className="space-y-3 text-base md:text-lg">
                    <div className="flex items-center justify-between">
                      <span>Rate:</span>
                      <span className="font-semibold">₱{ratePerHour.toFixed(0)} / hour</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Duration:</span>
                      <span className="font-semibold">{durationHours} hours</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Subtotal:</span>
                      <span className="font-semibold">₱{scannedBooking.amount.toFixed(0)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Reservation Fee:</span>
                      <span className="font-semibold">₱{reservationFee.toFixed(0)}</span>
                    </div>
                  </div>

                  <div className="mt-5 bg-[#9ccfcb] rounded-2xl p-4 text-base md:text-lg">
                    <div className="flex items-center justify-between">
                      <span>Total:</span>
                      <span className="font-bold">₱{totalWithFee.toFixed(0)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span>Payment Status:</span>
                      <span className="font-bold uppercase">{scannedBooking.paymentStatus}</span>
                    </div>
                    <div className="text-right mt-2 font-medium">E-Payment</div>
                  </div>

                  <button
                    type="button"
                    disabled={scannedBooking.checkedIn}
                    onClick={handleConfirmCheckIn}
                    className="mt-5 rounded-xl bg-teal-600 px-5 py-3 text-white font-semibold hover:bg-teal-700 disabled:opacity-60 w-full md:w-auto"
                  >
                    {scannedBooking.checkedIn ? 'Already Checked In' : 'Confirm Check-In'}
                  </button>
                </section>
              </div>

              <div className="space-y-6">
                <section className="bg-[#f2f4f5] rounded-2xl border border-slate-300 overflow-hidden shadow-md text-slate-900">
                  <img
                    src={scannedMeta?.image || '/tennis.png'}
                    alt={scannedCourtName}
                    className="w-full h-72 object-cover"
                  />
                  <div className="p-6 space-y-4 text-base md:text-lg">
                    <h4 className="text-2xl md:text-3xl font-semibold">{scannedCourtName}</h4>
                    <p className="flex items-center gap-2 text-slate-700 text-sm md:text-base">
                      <MapPin className="w-4 h-4" />
                      {scannedMeta?.location || 'Court Location'}
                    </p>
                    <div className="flex items-center justify-between">
                      <span>Sport</span>
                      <span className="px-3 py-1 rounded-xl bg-teal-500 text-white text-base font-semibold">
                        {scannedMeta?.sport || 'Court Sport'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Price</span>
                      <span className="font-semibold">₱{ratePerHour.toFixed(0)}/hour</span>
                    </div>
                  </div>
                </section>

                <p className="text-base leading-relaxed text-slate-100">
                  <span className="font-semibold">Note:</span><br />
                  Please arrive on time. Check-in may be required before play.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1F464A] text-slate-100 py-4 px-4 md:px-6">
      <div className="max-w-5xl mx-auto flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBackNavigation}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
            aria-label="Back to Profile"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold leading-tight">QR Check-In</h1>
            <p className="text-slate-200 text-sm">Show your booking QR code to staff upon arrival.</p>
          </div>
        </div>

        <section className="relative bg-[#eef1f2] text-slate-900 rounded-3xl border border-slate-300 shadow-sm p-4 md:p-6">
          {!showQr ? (
            <div className="grid grid-cols-1 lg:grid-cols-[1.4fr,0.8fr] gap-6 items-center min-h-[240px]">
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <CalendarDays className="w-7 h-7 text-slate-900" />
                  <h2 className="text-2xl font-semibold tracking-tight">Today's Booking</h2>
                </div>

                {visibleBooking ? (
                  <div className="rounded-2xl bg-white border border-slate-200 p-5 flex items-start gap-3">
                    <MapPin className="w-6 h-6 mt-1 text-slate-800" />
                    <div className="leading-tight">
                      <p className="text-2xl font-semibold text-slate-900">{courtName}</p>
                      <p className="text-lg text-slate-800 mt-1">{timeRange}</p>
                      <p className="text-sm text-slate-600 mt-2">{bookingDateText}</p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl bg-white border border-slate-200 p-5">
                    <p className="text-xl font-semibold text-slate-700">No booking available</p>
                    <p className="text-sm md:text-base text-slate-600 mt-1">Book a court to generate your QR check-in code.</p>
                  </div>
                )}
              </div>

              <div className="flex justify-start lg:justify-end">
                <button
                  type="button"
                  onClick={() => visibleBooking && setShowQr(true)}
                  disabled={!visibleBooking}
                  className="bg-[#1F464A] hover:bg-[#1b3f43] disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-2xl px-6 py-5 min-w-[250px] md:min-w-[290px] transition-all text-left shadow-sm hover:shadow-md"
                >
                  <div className="flex items-start gap-3">
                    <div className="bg-white/15 rounded-lg p-2 shrink-0">
                      <QrCode className="w-6 h-6 text-white" />
                    </div>
                    <div className="leading-tight">
                      <p className="text-base md:text-lg font-semibold">Show QR Booking Details</p>
                      <p className="text-xs md:text-sm text-teal-100 mt-1">Click to display your QR code for check-in.</p>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2.5 min-h-[240px]">
              <button
                type="button"
                onClick={() => setShowQr(false)}
                className="absolute top-4 left-4 p-2 rounded-full hover:bg-slate-100 text-slate-700 transition-colors"
                aria-label="Back to Show QR Booking Details"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <p className="text-sm text-slate-500">Scan this QR code at the counter</p>
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <QRCode value={qrValue} size={190} />
              </div>
              <button
                type="button"
                onClick={() => setShowQr(false)}
                className="w-full max-w-[220px] text-sm py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Hide QR
              </button>
              <p className="text-xs text-slate-500">QR auto-generated for your next active booking.</p>
            </div>
          )}
        </section>

        <section className="bg-white text-slate-900 rounded-2xl border border-slate-200 shadow-sm p-5 md:p-6">
          <div className="flex items-center gap-3 mb-3">
            <CircleCheck className="w-5 h-5 text-teal-700" />
            <h3 className="text-xl font-semibold">How to Check-In</h3>
          </div>
          <ol className="list-decimal pl-6 md:pl-8 space-y-2 text-sm md:text-[15px] text-slate-700">
            <li>Check-in window opens 30 minutes before your booking time.</li>
            <li>Show this QR code to staff to verify your booking.</li>
            <li>Staff scans the QR code to complete your check-in.</li>
            <li>If you do not check in within 15 minutes of start time, your booking may be released.</li>
          </ol>
          <div className="mt-4 p-3 rounded-lg bg-teal-50 text-teal-800 text-sm flex items-center gap-2">
            <QrCode className="w-4 h-4" />
            Keep this page open while entering the facility for faster check-in.
          </div>
        </section>
      </div>
    </div>
  );
}
