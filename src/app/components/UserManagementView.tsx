import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Search, Filter, Trash2, Mail, CheckCircle, BadgeCheck, Clock3, XCircle } from 'lucide-react';
import { toast } from 'sonner';

export function UserManagementView() {
  const {
    bootstrapped,
    users,
    adminUpdateUser,
    adminDeleteUser,
    currentUser,
    getCoachVerificationQueue,
    approveCoachVerification,
    rejectCoachVerification,
  } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState(() => {
    const stored = sessionStorage.getItem('ventra_admin_role_filter') || '';
    return stored || 'all';
  });
  const [verificationFilter, setVerificationFilter] = useState<'pending' | 'verified' | 'rejected' | 'unverified'>(() => {
    const stored = sessionStorage.getItem('ventra_admin_verification_filter') || '';
    if (stored === 'pending' || stored === 'verified' || stored === 'rejected' || stored === 'unverified') return stored;
    return 'pending';
  });
  const [verificationQueue, setVerificationQueue] = useState<typeof users>([]);
  const [isVerificationLoading, setIsVerificationLoading] = useState(false);
  const [verificationQueueLoaded, setVerificationQueueLoaded] = useState(false);
  const [verificationReviewModal, setVerificationReviewModal] = useState<{
    open: boolean;
    mode: 'view' | 'approve' | 'reject';
    coachId: string;
    coachName: string;
  }>({
    open: false,
    mode: 'view',
    coachId: '',
    coachName: '',
  });
  const [verificationReviewText, setVerificationReviewText] = useState('');
  const [isSubmittingVerificationReview, setIsSubmittingVerificationReview] = useState(false);

  const coachUnderReview = useMemo(() => {
    const coachId = verificationReviewModal.coachId;
    if (!coachId) return null;
    return (
      verificationQueue.find((u) => u.id === coachId) ||
      users.find((u) => u.id === coachId) ||
      null
    );
  }, [users, verificationQueue, verificationReviewModal.coachId]);

  if (!bootstrapped) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-950 p-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 text-slate-600 dark:text-slate-300">
          Loading users...
        </div>
      </div>
    );
  }

  const filteredUsers = users.filter(user => {
    const matchesSearch = (user.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
                          user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await adminUpdateUser(userId, { role: newRole });
      toast.success(`User role updated to ${newRole}`);
    } catch (error) {
      toast.error('Failed to update role');
    }
  };

  const handleDelete = async (userId: string) => {
    if (userId === currentUser?.id) {
      toast.error("You cannot delete your own account.");
      return;
    }
    if (confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      try {
        await adminDeleteUser(userId);
        toast.success('User deleted successfully');
      } catch (error) {
        toast.error('Failed to delete user');
      }
    }
  };

  const loadVerificationQueue = async () => {
    if (currentUser?.role !== 'admin' && currentUser?.role !== 'staff') {
      setVerificationQueue([]);
      setVerificationQueueLoaded(true);
      return;
    }
    setIsVerificationLoading(true);
    try {
      const rows = await getCoachVerificationQueue({ status: verificationFilter });
      setVerificationQueue(rows);
    } catch {
      toast.error('Failed to load coach verification queue.');
    } finally {
      setIsVerificationLoading(false);
      setVerificationQueueLoaded(true);
    }
  };

  useEffect(() => {
    loadVerificationQueue();
  }, [verificationFilter, currentUser?.role]);

  useEffect(() => {
    sessionStorage.setItem('ventra_admin_verification_filter', verificationFilter);
  }, [verificationFilter]);

  useEffect(() => {
    sessionStorage.setItem('ventra_admin_role_filter', roleFilter);
  }, [roleFilter]);

  const openCoachReviewModal = (coachId: string, coachName: string) => {
    setVerificationReviewText('');
    setVerificationReviewModal({
      open: true,
      mode: 'view',
      coachId,
      coachName,
    });
  };

  const closeVerificationReviewModal = () => {
    if (isSubmittingVerificationReview) return;
    setVerificationReviewModal((prev) => ({ ...prev, open: false }));
    setVerificationReviewText('');
  };

  const handleSubmitVerificationReview = async () => {
    const { coachId, mode } = verificationReviewModal;
    if (!coachId) return;
    if (mode !== 'approve' && mode !== 'reject') return;
    setIsSubmittingVerificationReview(true);
    try {
      if (mode === 'approve') {
        await approveCoachVerification(coachId, verificationReviewText.trim() || undefined);
        toast.success('Coach verification approved.');
      } else {
        await rejectCoachVerification(coachId, verificationReviewText.trim() || undefined);
        toast.success('Coach verification rejected.');
      }
      setVerificationReviewModal((prev) => ({ ...prev, open: false }));
      setVerificationReviewText('');
      await loadVerificationQueue();
    } catch {
      toast.error(mode === 'approve' ? 'Failed to approve coach verification.' : 'Failed to reject coach verification.');
    } finally {
      setIsSubmittingVerificationReview(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 p-6 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">User Management</h1>
          <p className="text-slate-500 dark:text-slate-400">Manage system access and user roles.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search users..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-teal-500 outline-none w-64"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select 
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="pl-10 pr-8 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-teal-500 outline-none appearance-none cursor-pointer"
            >
              <option value="all">All Roles</option>
              <option value="admin">Admin</option>
              <option value="staff">Staff</option>
              <option value="coach">Coach</option>
              <option value="player">Player</option>
            </select>
          </div>
        </div>
      </div>

      {(currentUser?.role === 'admin' || currentUser?.role === 'staff') && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Coach Verification Queue</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Review coach identity and credentials submissions.</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={verificationFilter}
                onChange={(e) =>
                  setVerificationFilter(e.target.value as 'pending' | 'verified' | 'rejected' | 'unverified')
                }
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
              >
                <option value="pending">Pending</option>
                <option value="verified">Verified</option>
                <option value="rejected">Rejected</option>
                <option value="unverified">Unverified</option>
              </select>
              <button
                type="button"
                onClick={() => void loadVerificationQueue()}
                className="px-3 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-teal-700 dark:hover:bg-teal-600 text-sm font-semibold"
              >
                Refresh
              </button>
            </div>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {!verificationQueueLoaded && verificationQueue.length === 0 && (
              <p className="p-4 text-sm text-slate-500 dark:text-slate-400">Loading verification queue...</p>
            )}
            {verificationQueueLoaded && !isVerificationLoading && verificationQueue.length === 0 && (
              <div className="p-4 text-sm text-slate-500 dark:text-slate-400 space-y-1">
                <p>No coaches found for this filter.</p>
                {verificationFilter === 'pending' && (
                  <p className="text-xs">
                    If the coach signed up on a different device/browser, they won’t appear here in standalone mode
                    (localStorage is not shared). Enable backend API mode for shared approvals.
                  </p>
                )}
              </div>
            )}
            {verificationQueueLoaded && verificationQueue.length > 0 && (
              <div className="relative">
                {isVerificationLoading && (
                  <div className="absolute inset-0 bg-white/60 dark:bg-slate-900/60 backdrop-blur-[1px] z-10 flex items-start justify-end p-4">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-full px-3 py-1">
                      Refreshing…
                    </span>
                  </div>
                )}

                {verificationQueue.map((coach) => (
                  <div key={coach.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white text-sm">{coach.name || coach.email}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{coach.email}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {coach.coachVerificationMethod || 'method not set'} - {coach.coachVerificationDocumentName || 'document not set'}
                      </p>
                      {coach.coachVerificationNotes && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Notes: {coach.coachVerificationNotes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                          coach.coachVerificationStatus === 'verified'
                            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
                            : coach.coachVerificationStatus === 'pending'
                              ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-300'
                              : 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400'
                        }`}
                      >
                        {coach.coachVerificationStatus === 'verified' ? <BadgeCheck size={10} /> : coach.coachVerificationStatus === 'pending' ? <Clock3 size={10} /> : <XCircle size={10} />}
                        {coach.coachVerificationStatus || 'unverified'}
                      </span>
                      <button
                        onClick={() => openCoachReviewModal(coach.id, coach.name || coach.email)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-teal-700 dark:hover:bg-teal-600 transition-colors"
                      >
                        {coach.coachVerificationStatus === 'pending' ? 'Review' : 'View'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">User</th>
                <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Role</th>
                <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Status</th>
                <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center text-teal-700 dark:text-teal-400 font-bold">
                        {user.avatar ? <img src={user.avatar} alt={user.name} className="w-full h-full rounded-full object-cover" /> : (user.name?.[0] || user.email[0]).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white text-sm">{user.name || 'Unnamed User'}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                          <Mail size={10} /> {user.email}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <select 
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      disabled={currentUser?.role === 'staff' && user.role === 'admin'}
                      className="text-xs font-bold uppercase bg-slate-100 dark:bg-slate-800 border-none rounded px-2 py-1 cursor-pointer focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="player">Player</option>
                      <option value="coach">Coach</option>
                      <option value="staff">Staff</option>
                      <option value="admin" disabled={currentUser?.role === 'staff'}>
                        Admin
                      </option>
                    </select>
                  </td>
                  <td className="p-4">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                      <CheckCircle size={10} /> Active
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    {currentUser?.role === 'admin' && (
                      <button 
                        onClick={() => handleDelete(user.id)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
                        title="Delete User"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredUsers.length === 0 && (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400">
            No users found matching your search.
          </div>
        )}
      </div>

      {verificationReviewModal.open && (
        <div className="fixed inset-0 z-50 bg-black/40 p-4 flex items-center justify-center">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {verificationReviewModal.mode === 'view'
                  ? 'Review Coach Application'
                  : verificationReviewModal.mode === 'approve'
                    ? 'Approve Coach Verification'
                    : 'Reject Coach Verification'}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {verificationReviewModal.coachName}
              </p>
            </div>
            <div className="p-5 space-y-4">
              {coachUnderReview && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 p-4 space-y-3">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">Application Details</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Email</p>
                      <p className="text-slate-900 dark:text-slate-100 break-all">{coachUnderReview.email}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Phone</p>
                      <p className="text-slate-900 dark:text-slate-100">{coachUnderReview.phone || 'Not provided'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Verification Status</p>
                      <p className="text-slate-900 dark:text-slate-100">{coachUnderReview.coachVerificationStatus || 'unverified'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Submitted At</p>
                      <p className="text-slate-900 dark:text-slate-100">
                        {coachUnderReview.coachVerificationSubmittedAt
                          ? new Date(coachUnderReview.coachVerificationSubmittedAt).toLocaleString()
                          : 'Not available'}
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Verification Method</p>
                      <p className="text-slate-900 dark:text-slate-100">{coachUnderReview.coachVerificationMethod || 'Not provided'}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Document</p>
                      <p className="text-slate-900 dark:text-slate-100">
                        {coachUnderReview.coachVerificationDocumentName || 'Not provided'}
                        {coachUnderReview.coachVerificationId ? ` (${coachUnderReview.coachVerificationId})` : ''}
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Coach Profile</p>
                      <p className="text-slate-900 dark:text-slate-100 whitespace-pre-wrap">
                        {coachUnderReview.coachProfile || 'Not provided'}
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Expertise</p>
                      <p className="text-slate-900 dark:text-slate-100">
                        {coachUnderReview.coachExpertise?.length ? coachUnderReview.coachExpertise.join(', ') : 'Not provided'}
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Applicant Notes</p>
                      <p className="text-slate-900 dark:text-slate-100 whitespace-pre-wrap">
                        {coachUnderReview.coachVerificationNotes || 'None'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {verificationReviewModal.mode !== 'view' && (
                <>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    {verificationReviewModal.mode === 'approve' ? 'Approval note (optional)' : 'Rejection reason (optional)'}
                  </label>
                  <textarea
                    value={verificationReviewText}
                    onChange={(e) => setVerificationReviewText(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none resize-none"
                    placeholder={
                      verificationReviewModal.mode === 'approve'
                        ? 'Add optional internal review note.'
                        : 'Explain why this verification is being rejected.'
                    }
                  />
                </>
              )}
            </div>
            <div className="p-5 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              {verificationReviewModal.mode === 'view' ? (
                <>
                  <button
                    onClick={closeVerificationReviewModal}
                    disabled={isSubmittingVerificationReview}
                    className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60"
                  >
                    Close
                  </button>
                  {coachUnderReview?.coachVerificationStatus === 'pending' && (
                    <>
                      <button
                        onClick={() => {
                          setVerificationReviewText('');
                          setVerificationReviewModal((prev) => ({ ...prev, mode: 'reject' }));
                        }}
                        className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => {
                          setVerificationReviewText('');
                          setVerificationReviewModal((prev) => ({ ...prev, mode: 'approve' }));
                        }}
                        className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        Approve
                      </button>
                    </>
                  )}
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      if (isSubmittingVerificationReview) return;
                      setVerificationReviewModal((prev) => ({ ...prev, mode: 'view' }));
                      setVerificationReviewText('');
                    }}
                    disabled={isSubmittingVerificationReview}
                    className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => void handleSubmitVerificationReview()}
                    disabled={isSubmittingVerificationReview}
                    className={`px-4 py-2 rounded-lg text-white disabled:opacity-60 ${
                      verificationReviewModal.mode === 'approve'
                        ? 'bg-emerald-600 hover:bg-emerald-700'
                        : 'bg-rose-600 hover:bg-rose-700'
                    }`}
                  >
                    {isSubmittingVerificationReview
                      ? 'Submitting...'
                      : verificationReviewModal.mode === 'approve'
                        ? 'Approve'
                        : 'Reject'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
