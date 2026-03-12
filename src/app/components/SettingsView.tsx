import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { backendApi } from '@/context/backendApi';
import { Save, Clock, Calendar, AlertTriangle, Power, TrendingUp, Download, Upload, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export function SettingsView() {
  const { config, updateConfig } = useApp();
  const usingBackendApi = backendApi.isEnabled;
  const RECONCILIATION_ISSUE_TYPES = [
    'paid_tx_booking_unpaid',
    'booking_paid_without_paid_tx',
    'confirmed_unpaid_without_tx',
    'orphan_tx_booking_missing',
  ] as const;
  const [formData, setFormData] = useState(config);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImportConfirmOpen, setIsImportConfirmOpen] = useState(false);
  const [fileToImport, setFileToImport] = useState<File | null>(null);
  const [isClearDataConfirmOpen, setIsClearDataConfirmOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isLoadingAuditLogs, setIsLoadingAuditLogs] = useState(false);
  const [isLoadingPaymentHealth, setIsLoadingPaymentHealth] = useState(false);
  const [isLoadingUnpaidMonitor, setIsLoadingUnpaidMonitor] = useState(false);
  const [isLoadingReconciliation, setIsLoadingReconciliation] = useState(false);
  const [isResolvingByFilter, setIsResolvingByFilter] = useState(false);
  const [isResolvingIssue, setIsResolvingIssue] = useState(false);
  const [isResolvingBulkIssues, setIsResolvingBulkIssues] = useState(false);
  const [isExpiringStalePayments, setIsExpiringStalePayments] = useState(false);
  const [isPurgingAuditLogs, setIsPurgingAuditLogs] = useState(false);
  const [reconciliationIssueType, setReconciliationIssueType] = useState<string>('paid_tx_booking_unpaid');
  const [unpaidMonitorStatus, setUnpaidMonitorStatus] = useState<'all' | 'overdue' | 'at_risk'>('all');
  const [unpaidMonitorWindowMinutes, setUnpaidMonitorWindowMinutes] = useState(120);
  const [staleOlderThanMinutes, setStaleOlderThanMinutes] = useState(180);
  const [auditPurgeBeforeDate, setAuditPurgeBeforeDate] = useState(new Date().toISOString().slice(0, 10));
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [paymentHealth, setPaymentHealth] = useState<any | null>(null);
  const [unpaidMonitorRows, setUnpaidMonitorRows] = useState<any[]>([]);
  const [reconciliationIssues, setReconciliationIssues] = useState<any[]>([]);
  const [selectedReconciliationIssueKeys, setSelectedReconciliationIssueKeys] = useState<string[]>([]);

  const downloadTextFile = (filename: string, content: string, contentType: string) => {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    setFormData(config);
  }, [config]);

  useEffect(() => {
    if (!usingBackendApi) return;
    void loadPaymentHealth();
    void loadUnpaidMonitor();
    void loadReconciliation();
    void loadAuditLogs();
  }, [usingBackendApi]);

  useEffect(() => {
    if (!usingBackendApi) return;
    void loadUnpaidMonitor();
  }, [unpaidMonitorStatus, unpaidMonitorWindowMinutes, usingBackendApi]);

  useEffect(() => {
    if (!usingBackendApi) return;
    void loadReconciliation();
  }, [reconciliationIssueType, usingBackendApi]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (type === 'number' ? Number(value) : value)
    }));
  };

  const handlePeakHourChange = (index: number, field: 'start' | 'end', value: string) => {
    const newPeakHours = [...(formData.peakHours || [])];
    if (!newPeakHours[index]) return;
    newPeakHours[index] = { ...newPeakHours[index], [field]: value };
    setFormData(prev => ({
      ...prev,
      peakHours: newPeakHours
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateConfig(formData);
      toast.success('System settings updated successfully');
    } catch (error) {
      console.error('Failed to update system settings:', error);
      toast.error('Failed to update system settings.');
    }
  };

  const handleExportData = () => {
    try {
      if (usingBackendApi) {
        setIsExporting(true);
        backendApi
          .adminExportData()
          .then((payload) => {
            const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
              JSON.stringify(payload.data, null, 2)
            )}`;
            const link = document.createElement("a");
            link.href = jsonString;
            link.download = payload.filename;
            link.click();
            toast.success("Data exported successfully!");
          })
          .catch((error) => {
            console.error("Failed to export backend data:", error);
            toast.error("Failed to export backend data.");
          })
          .finally(() => setIsExporting(false));
        return;
      }

      const dataToExport = {
        users: JSON.parse(localStorage.getItem('ventra_users') || '[]'),
        courts: JSON.parse(localStorage.getItem('ventra_courts') || '[]'),
        bookings: JSON.parse(localStorage.getItem('ventra_bookings') || '[]'),
        memberships: JSON.parse(localStorage.getItem('ventra_memberships') || '[]'),
        subscriptions: JSON.parse(localStorage.getItem('ventra_subscriptions') || '[]'),
        notifications: JSON.parse(localStorage.getItem('ventra_notifications') || '[]'),
        auth: JSON.parse(localStorage.getItem('ventra_auth') || '{}'),
      };

      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(dataToExport, null, 2)
      )}`;
      const link = document.createElement("a");
      link.href = jsonString;
      link.download = `ventra-backup-${new Date().toISOString().split('T')[0]}.json`;

      link.click();
      toast.success("Data exported successfully!");
    } catch (error) {
      console.error("Failed to export data:", error);
      toast.error("An error occurred while exporting data.");
    } finally {
      if (!usingBackendApi) setIsExporting(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setFileToImport(file);
      setIsImportConfirmOpen(true);
    }
    // Reset file input to allow selecting the same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleConfirmImport = () => {
    if (!fileToImport) return;
    setIsImporting(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result;
        if (typeof text !== 'string') {
          throw new Error("Failed to read file content.");
        }
        const data = JSON.parse(text);

        const requiredKeys = ['users', 'courts', 'bookings', 'memberships', 'auth'];
        const requiredBackendKeys = ['users', 'courts', 'bookings', 'memberships'];
        const required = usingBackendApi ? requiredBackendKeys : requiredKeys;
        const hasRequiredKeys = required.every(key => key in data);
        if (!hasRequiredKeys) {
          toast.error("Invalid backup file. Missing required data sections.");
          setIsImporting(false);
          return;
        }

        if (usingBackendApi) {
          backendApi
            .adminImportData(data, true)
            .then(() => {
              toast.success("Backend data imported successfully! The application will now reload.", {
                duration: 4000,
              });
              setTimeout(() => {
                window.location.reload();
              }, 1500);
            })
            .catch((error) => {
              console.error("Failed to import backend data:", error);
              toast.error("Failed to import backend data.");
            })
            .finally(() => {
              setIsImporting(false);
            });
          setIsImportConfirmOpen(false);
          return;
        }

        Object.keys(data).forEach(key => {
          const storageKey = `ventra_${key}`;
          localStorage.setItem(storageKey, JSON.stringify(data[key]));
        });

        toast.success("Data imported successfully! The application will now reload.", {
          duration: 4000,
        });

        setTimeout(() => {
          window.location.reload();
        }, 1500);

      } catch (error) {
        console.error("Failed to import data:", error);
        toast.error("Failed to parse or import data. Please check the file format.");
        setIsImporting(false);
      }
    };
    reader.onerror = () => {
      setIsImporting(false);
      toast.error("Failed to read selected file.");
    };
    reader.readAsText(fileToImport);
    setIsImportConfirmOpen(false);
  };

  const handleConfirmClearData = () => {
    setIsClearing(true);
    if (usingBackendApi) {
      backendApi
        .adminResetData()
        .then(() => {
          toast.success("Backend data reset complete. The application will now reload.", {
            duration: 4000,
          });
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        })
        .catch((error) => {
          console.error("Failed to reset backend data:", error);
          toast.error("Failed to reset backend data.");
        })
        .finally(() => {
          setIsClearing(false);
          setIsClearDataConfirmOpen(false);
        });
      return;
    }

    localStorage.clear();
    toast.success("All data cleared. The application will now reload.", {
      duration: 4000,
    });
    setTimeout(() => {
      window.location.reload();
    }, 1500);
    setIsClearing(false);
    setIsClearDataConfirmOpen(false);
  };

  const loadAuditLogs = async () => {
    if (!usingBackendApi) return;
    try {
      setIsLoadingAuditLogs(true);
      const rows = await backendApi.getAuditLogs({ page: 1, limit: 20 });
      setAuditLogs(Array.isArray(rows) ? rows : []);
    } catch (error) {
      console.error('Failed to load audit logs:', error);
      toast.error('Failed to load audit logs.');
    } finally {
      setIsLoadingAuditLogs(false);
    }
  };

  const loadPaymentHealth = async () => {
    if (!usingBackendApi) return;
    try {
      setIsLoadingPaymentHealth(true);
      const health = await backendApi.getPaymentsHealth();
      setPaymentHealth(health);
    } catch (error) {
      console.error('Failed to load payment health:', error);
      toast.error('Failed to load payment health.');
    } finally {
      setIsLoadingPaymentHealth(false);
    }
  };

  const loadUnpaidMonitor = async () => {
    if (!usingBackendApi) return;
    try {
      setIsLoadingUnpaidMonitor(true);
      const rows = await backendApi.getUnpaidBookingMonitor({
        status: unpaidMonitorStatus,
        windowMinutes: unpaidMonitorWindowMinutes,
      });
      setUnpaidMonitorRows(Array.isArray(rows) ? rows : []);
    } catch (error) {
      console.error('Failed to load unpaid booking monitor:', error);
      toast.error('Failed to load unpaid booking monitor.');
    } finally {
      setIsLoadingUnpaidMonitor(false);
    }
  };

  const loadReconciliation = async () => {
    if (!usingBackendApi) return;
    try {
      setIsLoadingReconciliation(true);
      const rows = await backendApi.getPaymentReconciliation({
        issueType: reconciliationIssueType,
        page: 1,
        limit: 20,
      });
      setReconciliationIssues(Array.isArray(rows) ? rows : []);
    } catch (error) {
      console.error('Failed to load payment reconciliation issues:', error);
      toast.error('Failed to load payment reconciliation issues.');
    } finally {
      setIsLoadingReconciliation(false);
      setSelectedReconciliationIssueKeys([]);
    }
  };

  const getReconciliationRowKey = (row: any, index: number) =>
    `${String(row?.issueType || 'issue')}::${String(row?.bookingId || '')}::${String(row?.txId || '')}::${String(row?.detectedAt || index)}`;

  const resolveSingleIssue = async (row: any, dryRun: boolean) => {
    if (!usingBackendApi) return;
    try {
      setIsResolvingIssue(true);
      const payload = await backendApi.resolvePaymentReconciliation({
        issueType: String(row?.issueType || reconciliationIssueType),
        bookingId: row?.bookingId ? String(row.bookingId) : undefined,
        txId: row?.txId ? String(row.txId) : undefined,
        dryRun,
      });
      const resolvedCount = Number(payload?.summary?.resolved || payload?.resolved || 0);
      const matchedCount = Number(payload?.summary?.matched || payload?.matched || 0);
      if (dryRun) {
        toast.success(`Dry run complete. ${matchedCount} issue(s) matched.`);
      } else {
        toast.success(`Resolved ${resolvedCount || matchedCount} issue(s).`);
      }
      await loadReconciliation();
      await loadPaymentHealth();
    } catch (error) {
      console.error('Failed to resolve reconciliation issue:', error);
      toast.error('Failed to resolve reconciliation issue.');
    } finally {
      setIsResolvingIssue(false);
    }
  };

  const resolveSelectedIssues = async (dryRun: boolean) => {
    if (!usingBackendApi) return;
    if (selectedReconciliationIssueKeys.length === 0) {
      toast.error('Select at least one reconciliation issue.');
      return;
    }
    try {
      setIsResolvingBulkIssues(true);
      const selectedRows = reconciliationIssues.filter((row, index) =>
        selectedReconciliationIssueKeys.includes(getReconciliationRowKey(row, index))
      );
      const items = selectedRows.map((row) => ({
        issueType: String(row?.issueType || reconciliationIssueType),
        bookingId: row?.bookingId ? String(row.bookingId) : undefined,
        txId: row?.txId ? String(row.txId) : undefined,
        dryRun,
      }));
      const payload = await backendApi.resolvePaymentReconciliationBulk(items, dryRun);
      const total = Number(payload?.summary?.total || payload?.total || items.length);
      const resolved = Number(payload?.summary?.resolved || payload?.resolved || 0);
      if (dryRun) {
        toast.success(`Dry run complete. ${total} issue(s) checked.`);
      } else {
        toast.success(`Resolved ${resolved || total} issue(s).`);
      }
      await loadReconciliation();
      await loadPaymentHealth();
    } catch (error) {
      console.error('Failed to resolve selected reconciliation issues:', error);
      toast.error('Failed to resolve selected reconciliation issues.');
    } finally {
      setIsResolvingBulkIssues(false);
    }
  };

  const handleExportAuditLogs = async (format: 'json' | 'csv') => {
    if (!usingBackendApi) return;
    try {
      const payload = await backendApi.exportAuditLogs({ format });
      const filename = String(payload?.filename || `audit_logs_export.${format}`);
      const contentType = String(payload?.contentType || (format === 'csv' ? 'text/csv' : 'application/json'));
      const raw = payload?.data;
      const content = typeof raw === 'string' ? raw : JSON.stringify(raw ?? {}, null, 2);
      downloadTextFile(filename, content, contentType);
      toast.success('Audit logs exported.');
    } catch (error) {
      console.error('Failed to export audit logs:', error);
      toast.error('Failed to export audit logs.');
    }
  };

  const handleExportReconciliation = async (format: 'json' | 'csv') => {
    if (!usingBackendApi) return;
    try {
      const payload = await backendApi.exportPaymentReconciliation({
        format,
        issueType: reconciliationIssueType || undefined,
      });
      const filename = String(payload?.filename || `payment_reconciliation_export.${format}`);
      const contentType = String(payload?.contentType || (format === 'csv' ? 'text/csv' : 'application/json'));
      const raw = payload?.data;
      const content = typeof raw === 'string' ? raw : JSON.stringify(raw ?? {}, null, 2);
      downloadTextFile(filename, content, contentType);
      toast.success('Payment reconciliation exported.');
    } catch (error) {
      console.error('Failed to export reconciliation:', error);
      toast.error('Failed to export reconciliation.');
    }
  };

  const handleResolveByFilter = async (dryRun: boolean) => {
    if (!usingBackendApi) return;
    try {
      setIsResolvingByFilter(true);
      const payload = await backendApi.resolvePaymentReconciliationByFilter({
        issueType: reconciliationIssueType,
        maxItems: 20,
        dryRun,
      });
      const summary = Number(payload?.summary?.total || 0);
      if (dryRun) toast.success(`Dry run complete. ${summary} issue(s) matched.`);
      else toast.success(`Resolved ${summary} issue(s).`);
      await loadReconciliation();
      await loadPaymentHealth();
    } catch (error) {
      console.error('Failed to resolve reconciliation issues:', error);
      toast.error('Failed to resolve reconciliation issues.');
    } finally {
      setIsResolvingByFilter(false);
    }
  };

  const handleExpireStalePayments = async (dryRun: boolean) => {
    if (!usingBackendApi) return;
    try {
      setIsExpiringStalePayments(true);
      const result = await backendApi.expireStalePayments({
        dryRun,
        olderThanMinutes: staleOlderThanMinutes,
      });
      const matched = Number(result?.matched || 0);
      const expired = Number(result?.expired || 0);
      if (dryRun) toast.success(`Dry run complete. ${matched} stale transaction(s) matched.`);
      else toast.success(`Expired ${expired} stale transaction(s).`);
      await loadPaymentHealth();
      await loadUnpaidMonitor();
    } catch (error) {
      console.error('Failed to expire stale payments:', error);
      toast.error('Failed to expire stale payments.');
    } finally {
      setIsExpiringStalePayments(false);
    }
  };

  const handlePurgeAuditLogs = async (dryRun: boolean) => {
    if (!usingBackendApi) return;
    try {
      setIsPurgingAuditLogs(true);
      const result = await backendApi.purgeAuditLogs(auditPurgeBeforeDate, dryRun);
      const count = Number(result?.purgedCount || result?.matched || 0);
      if (dryRun) toast.success(`Dry run complete. ${count} audit log(s) would be purged.`);
      else toast.success(`Purged ${count} audit log(s).`);
      await loadAuditLogs();
    } catch (error) {
      console.error('Failed to purge audit logs:', error);
      toast.error('Failed to purge audit logs.');
    } finally {
      setIsPurgingAuditLogs(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">System Settings</h1>
        <p className="text-slate-500 dark:text-slate-400">Configure global facility rules and operational parameters.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Operational Hours */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 border border-slate-200 dark:border-slate-800 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
            <Clock className="w-5 h-5 text-teal-600" />
            Operational Hours
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Opening Time</label>
              <input
                type="time"
                name="openingTime"
                value={formData.openingTime}
                onChange={handleChange}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Closing Time</label>
              <input
                type="time"
                name="closingTime"
                value={formData.closingTime}
                onChange={handleChange}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Booking Rules */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 border border-slate-200 dark:border-slate-800 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-teal-600" />
            Booking Rules
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Booking Interval (minutes)</label>
              <input
                type="number"
                name="bookingInterval"
                value={formData.bookingInterval}
                onChange={handleChange}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Duration of each booking slot.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Buffer Time (minutes)</label>
              <input
                type="number"
                name="bufferTime"
                value={formData.bufferTime}
                onChange={handleChange}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Time between consecutive bookings.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Max Booking Duration (minutes)</label>
              <input
                type="number"
                name="maxBookingDuration"
                value={formData.maxBookingDuration}
                onChange={handleChange}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Advance Booking Limit (days)</label>
              <input
                type="number"
                name="advanceBookingDays"
                value={formData.advanceBookingDays}
                onChange={handleChange}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Peak Hours */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 border border-slate-200 dark:border-slate-800 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-teal-600" />
            Peak Hour Rules
          </h2>
          <div className="space-y-4">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Define time ranges where peak pricing applies.</p>
            {formData.peakHours?.map((peak, index) => (
              <div key={index} className="grid md:grid-cols-2 gap-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Start Time</label>
                  <input
                    type="time"
                    value={peak.start}
                    onChange={(e) => handlePeakHourChange(index, 'start', e.target.value)}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">End Time</label>
                  <input
                    type="time"
                    value={peak.end}
                    onChange={(e) => handlePeakHourChange(index, 'end', e.target.value)}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Cancellation Policy */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 border border-slate-200 dark:border-slate-800 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-teal-600" />
            Cancellation Policy
          </h2>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Cancellation Cutoff (hours)</label>
            <input
              type="number"
              name="cancellationCutoffHours"
              value={formData.cancellationCutoffHours}
              onChange={handleChange}
              className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Minimum hours before booking time to allow cancellation without penalty.</p>
          </div>
        </div>

        {/* System Status */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 border border-slate-200 dark:border-slate-800 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
            <Power className="w-5 h-5 text-teal-600" />
            System Status
          </h2>
          <div className="flex items-center justify-between">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Maintenance Mode</label>
              <p className="text-xs text-slate-500 dark:text-slate-400">Enable to prevent new bookings and show a maintenance message to users.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                name="maintenanceMode"
                checked={!!(formData as any).maintenanceMode} 
                onChange={handleChange}
                className="sr-only peer" 
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-300 dark:peer-focus:ring-teal-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-teal-600"></div>
            </label>
          </div>
        </div>

        {/* Data Management */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 border border-slate-200 dark:border-slate-800 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
            <Download className="w-5 h-5 text-teal-600" />
            Data Management
          </h2>
          <div className="space-y-6">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">Export all application data to a single JSON file. This is useful for backups or migrating to another system.</p>
              <button
                type="button"
                onClick={handleExportData}
                disabled={isExporting}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <Download size={18} />
                {isExporting ? 'Exporting...' : 'Export Data'}
              </button>
            </div>
            <div className="pt-6 border-t border-slate-200 dark:border-slate-700">
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">Import data from a JSON file. This will <span className="font-bold text-red-500">overwrite all existing data</span>.</p>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelected}
                  className="hidden"
                  accept="application/json"
                />
                <button
                    type="button"
                    onClick={handleImportClick}
                    disabled={isImporting}
                    className="px-5 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors flex items-center gap-2"
                >
                    <Upload size={18} />
                    {isImporting ? 'Importing...' : 'Import Data'}
                </button>
            </div>
            <div className="pt-6 border-t border-slate-200 dark:border-slate-700">
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">Clear all application data. This will <span className="font-bold text-red-500">permanently delete all data</span> and reset the application.</p>
                <button
                    type="button"
                    onClick={() => setIsClearDataConfirmOpen(true)}
                    disabled={isClearing}
                    className="px-5 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg font-medium hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors flex items-center gap-2"
                >
                    <Trash2 size={18} />
                    {isClearing ? 'Clearing...' : 'Clear All Data'}
                </button>
            </div>
          </div>
        </div>

        {usingBackendApi && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Backend Operations</h2>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold text-slate-900 dark:text-white">Payment Health</h3>
                <button
                  type="button"
                  onClick={() => void loadPaymentHealth()}
                  disabled={isLoadingPaymentHealth}
                  className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-60"
                >
                  {isLoadingPaymentHealth ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
              <div className="grid md:grid-cols-3 gap-3 text-sm">
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                  <p className="text-slate-500 dark:text-slate-400">Transactions</p>
                  <p className="font-semibold text-slate-900 dark:text-white">{Number(paymentHealth?.totals?.transactions || 0)}</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                  <p className="text-slate-500 dark:text-slate-400">Paid Rate</p>
                  <p className="font-semibold text-slate-900 dark:text-white">{Number(paymentHealth?.rates?.paidRate || 0)}%</p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                  <p className="text-slate-500 dark:text-slate-400">Failed Rate</p>
                  <p className="font-semibold text-slate-900 dark:text-white">{Number(paymentHealth?.rates?.failedRate || 0)}%</p>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="flex flex-wrap items-center gap-3 justify-between">
                <h3 className="font-semibold text-slate-900 dark:text-white">Payment Reconciliation</h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleExportReconciliation('csv')}
                    className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-sm"
                  >
                    Export CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => void loadReconciliation()}
                    disabled={isLoadingReconciliation}
                    className="px-3 py-2 rounded-lg bg-teal-600 text-white text-sm disabled:opacity-60"
                  >
                    {isLoadingReconciliation ? 'Refreshing...' : 'Refresh'}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 items-center">
                <select
                  value={reconciliationIssueType}
                  onChange={(e) => setReconciliationIssueType(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                >
                  {RECONCILIATION_ISSUE_TYPES.map((issueType) => (
                    <option key={issueType} value={issueType}>
                      {issueType}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void handleResolveByFilter(true)}
                  disabled={isResolvingByFilter}
                  className="px-3 py-2 rounded-lg bg-amber-100 text-amber-800 text-sm disabled:opacity-60"
                >
                  Dry Run Resolve
                </button>
                <button
                  type="button"
                  onClick={() => void handleResolveByFilter(false)}
                  disabled={isResolvingByFilter}
                  className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm disabled:opacity-60"
                >
                  Resolve Now
                </button>
                <button
                  type="button"
                  onClick={() => void resolveSelectedIssues(true)}
                  disabled={isResolvingBulkIssues || selectedReconciliationIssueKeys.length === 0}
                  className="px-3 py-2 rounded-lg bg-amber-100 text-amber-800 text-sm disabled:opacity-60"
                >
                  Dry Run Selected
                </button>
                <button
                  type="button"
                  onClick={() => void resolveSelectedIssues(false)}
                  disabled={isResolvingBulkIssues || selectedReconciliationIssueKeys.length === 0}
                  className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-60"
                >
                  Resolve Selected
                </button>
              </div>

              <div className="max-h-64 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="text-left p-2">
                        <input
                          type="checkbox"
                          checked={
                            reconciliationIssues.length > 0 &&
                            selectedReconciliationIssueKeys.length === reconciliationIssues.length
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedReconciliationIssueKeys(
                                reconciliationIssues.map((row, index) => getReconciliationRowKey(row, index))
                              );
                            } else {
                              setSelectedReconciliationIssueKeys([]);
                            }
                          }}
                        />
                      </th>
                      <th className="text-left p-2">Issue</th>
                      <th className="text-left p-2">Booking</th>
                      <th className="text-left p-2">Tx</th>
                      <th className="text-left p-2">Detected</th>
                      <th className="text-left p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reconciliationIssues.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-3 text-slate-500 dark:text-slate-400">
                          No reconciliation issues found.
                        </td>
                      </tr>
                    )}
                    {reconciliationIssues.map((row, index) => (
                      <tr key={getReconciliationRowKey(row, index)} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="p-2">
                          <input
                            type="checkbox"
                            checked={selectedReconciliationIssueKeys.includes(getReconciliationRowKey(row, index))}
                            onChange={(e) => {
                              const key = getReconciliationRowKey(row, index);
                              if (e.target.checked) {
                                setSelectedReconciliationIssueKeys((prev) => [...prev, key]);
                              } else {
                                setSelectedReconciliationIssueKeys((prev) => prev.filter((item) => item !== key));
                              }
                            }}
                          />
                        </td>
                        <td className="p-2">{String(row?.issueType || '')}</td>
                        <td className="p-2">{String(row?.bookingId || '-')}</td>
                        <td className="p-2">{String(row?.txId || '-')}</td>
                        <td className="p-2">{String(row?.detectedAt || '-')}</td>
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void resolveSingleIssue(row, true)}
                              disabled={isResolvingIssue}
                              className="px-2 py-1 rounded bg-amber-100 text-amber-800 text-xs disabled:opacity-60"
                            >
                              Dry Run
                            </button>
                            <button
                              type="button"
                              onClick={() => void resolveSingleIssue(row, false)}
                              disabled={isResolvingIssue}
                              className="px-2 py-1 rounded bg-emerald-600 text-white text-xs disabled:opacity-60"
                            >
                              Resolve
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-semibold text-slate-900 dark:text-white">Unpaid Booking Monitor</h3>
                <button
                  type="button"
                  onClick={() => void loadUnpaidMonitor()}
                  disabled={isLoadingUnpaidMonitor}
                  className="px-3 py-2 rounded-lg bg-teal-600 text-white text-sm disabled:opacity-60"
                >
                  {isLoadingUnpaidMonitor ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={unpaidMonitorStatus}
                  onChange={(e) => setUnpaidMonitorStatus(e.target.value as 'all' | 'overdue' | 'at_risk')}
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                >
                  <option value="all">all</option>
                  <option value="overdue">overdue</option>
                  <option value="at_risk">at_risk</option>
                </select>
                <input
                  type="number"
                  value={unpaidMonitorWindowMinutes}
                  onChange={(e) => setUnpaidMonitorWindowMinutes(Math.max(1, Number(e.target.value) || 120))}
                  className="w-36 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                />
                <span className="text-xs text-slate-500 dark:text-slate-400">window minutes</span>
              </div>
              <div className="max-h-64 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="text-left p-2">Booking</th>
                      <th className="text-left p-2">Urgency</th>
                      <th className="text-left p-2">Due At</th>
                      <th className="text-left p-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unpaidMonitorRows.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-3 text-slate-500 dark:text-slate-400">
                          No unpaid bookings in this view.
                        </td>
                      </tr>
                    )}
                    {unpaidMonitorRows.map((row, index) => (
                      <tr key={String(row?.id || index)} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="p-2">{String(row?.id || '-')}</td>
                        <td className="p-2">{String(row?.urgency || '-')}</td>
                        <td className="p-2">{String(row?.paymentDueAt || '-')}</td>
                        <td className="p-2">{Number(row?.amount || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
              <h3 className="font-semibold text-slate-900 dark:text-white">Stale Payment Sessions</h3>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  value={staleOlderThanMinutes}
                  onChange={(e) => setStaleOlderThanMinutes(Math.max(1, Number(e.target.value) || 180))}
                  className="w-36 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                />
                <span className="text-xs text-slate-500 dark:text-slate-400">olderThanMinutes</span>
                <button
                  type="button"
                  onClick={() => void handleExpireStalePayments(true)}
                  disabled={isExpiringStalePayments}
                  className="px-3 py-2 rounded-lg bg-amber-100 text-amber-800 text-sm disabled:opacity-60"
                >
                  Dry Run
                </button>
                <button
                  type="button"
                  onClick={() => void handleExpireStalePayments(false)}
                  disabled={isExpiringStalePayments}
                  className="px-3 py-2 rounded-lg bg-rose-600 text-white text-sm disabled:opacity-60"
                >
                  Expire Stale
                </button>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-semibold text-slate-900 dark:text-white">Audit Logs</h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleExportAuditLogs('csv')}
                    className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-sm"
                  >
                    Export CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => void loadAuditLogs()}
                    disabled={isLoadingAuditLogs}
                    className="px-3 py-2 rounded-lg bg-teal-600 text-white text-sm disabled:opacity-60"
                  >
                    {isLoadingAuditLogs ? 'Refreshing...' : 'Refresh'}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={auditPurgeBeforeDate}
                  onChange={(e) => setAuditPurgeBeforeDate(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                />
                <button
                  type="button"
                  onClick={() => void handlePurgeAuditLogs(true)}
                  disabled={isPurgingAuditLogs}
                  className="px-3 py-2 rounded-lg bg-amber-100 text-amber-800 text-sm disabled:opacity-60"
                >
                  Dry Run Purge
                </button>
                <button
                  type="button"
                  onClick={() => void handlePurgeAuditLogs(false)}
                  disabled={isPurgingAuditLogs}
                  className="px-3 py-2 rounded-lg bg-rose-600 text-white text-sm disabled:opacity-60"
                >
                  Purge Logs
                </button>
              </div>

              <div className="max-h-64 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="text-left p-2">Time</th>
                      <th className="text-left p-2">Action</th>
                      <th className="text-left p-2">Entity</th>
                      <th className="text-left p-2">Actor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-3 text-slate-500 dark:text-slate-400">
                          No audit logs found.
                        </td>
                      </tr>
                    )}
                    {auditLogs.map((log, index) => (
                      <tr key={String(log?.id || index)} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="p-2">{String(log?.createdAt || '-')}</td>
                        <td className="p-2">{String(log?.action || '-')}</td>
                        <td className="p-2">{String(log?.entityType || '-')}:{String(log?.entityId || '-')}</td>
                        <td className="p-2">{String(log?.actorId || '-')} ({String(log?.actorRole || '-')})</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {isImportConfirmOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200 p-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Import Data</h3>
              <p className="text-slate-500 dark:text-slate-400 mb-6">
                Are you sure you want to import <span className="font-bold text-slate-600 dark:text-slate-300">{fileToImport?.name}</span>? 
                This will <span className="font-bold text-red-500">overwrite all current data</span> in the application. This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <button 
                  onClick={() => setIsImportConfirmOpen(false)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleConfirmImport}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors"
                >
                  Import & Overwrite
                </button>
              </div>
            </div>
          </div>
        )}

        {isClearDataConfirmOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200 p-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Clear All Data</h3>
              <p className="text-slate-500 dark:text-slate-400 mb-6">
                Are you sure you want to clear all data? This action cannot be undone and will reset the application to its initial state.
              </p>
              <div className="flex gap-3 justify-end">
                <button 
                  onClick={() => setIsClearDataConfirmOpen(false)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleConfirmClearData}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors"
                >
                  Clear Everything
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            className="px-6 py-3 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 transition-colors shadow-lg shadow-teal-100 dark:shadow-none flex items-center gap-2"
          >
            <Save size={20} />
            Save Configuration
          </button>
        </div>
      </form>
    </div>
  );
}
