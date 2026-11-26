import { AdminOverview } from '../components/dashboard/AdminOverview.tsx';
import { Sensitive } from '../components/Sensitive.tsx';
import { getTodayIso } from '../utils/formatters.ts';
import { TabPanel } from '../components/motion/Motion.tsx';
import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { PublishSpaceForm } from '../components/PublishSpaceForm.tsx';
import { AdminUserLookup } from '../components/admin/AdminUserLookup.tsx';
import { createKycReviewUrl } from '../lib/storage.ts';
import { SII_THIRD_PARTY_URL, adminRejectTaxCertificate, adminSetTaxStatus, getTaxCertificateUrl, getTaxRoster, getTaxStatus, taxReviewDue, taxStatusOk, type TaxStatus } from '../lib/financeApi.ts';
import { downloadCsv } from '../utils/csv.ts';
import { ReportsPanel, KpiDashboard, PaymentsPanel, DiscountCodesPanel } from '../components/admin/AdminPanels.tsx';
import { AuditPanel } from '../components/admin/AuditPanel.tsx';
import { reservationLedger } from '../utils/ledger.ts';
import { PlatformFinancePanel } from '../components/admin/PlatformFinancePanel.tsx';
import { AdminSpaceDetailModal } from '../components/admin/AdminSpaceDetailModal.tsx';
import { useApp } from '../context/AppContext.tsx';
import { formatClp, formatRut, getSpaceRateInfo } from '../utils/formatters.ts';
import {
  ShieldCheck,
  Users,
  Building,
  Scale,
  CheckCircle2,
  XCircle,
  Search,
  Eye,
  FileText,
  ExternalLink,
  UserSearch,
  Clock,
  Banknote,
  MapPin,
  X,
  Check,
  UserCheck,
  Download,
  ScanFace,
  FileCheck2,
  ArrowLeftRight,
  LayoutDashboard,
  TrendingUp,
  CreditCard,
  TicketPercent,
  Gauge,
} from 'lucide-react';
import { DashboardShell } from '../components/dashboard/DashboardShell.tsx';

interface AdminDashboardPageProps {
  onOpenAuth?: (mode: 'login' | 'register', notice?: string) => void;
  onNavigate: (view: string, options?: { replace?: boolean }) => void;
}

function useKycReviewUrl(fileReference?: string): string {
  const [url, setUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    setUrl('');
    if (!fileReference) return () => { cancelled = true; };

    createKycReviewUrl(fileReference)
      .then((signedUrl) => {
        if (!cancelled) setUrl(signedUrl);
      })
      .catch((error) => {
        console.error('No se pudo abrir el archivo adjunto para revisión:', error);
      });

    return () => { cancelled = true; };
  }, [fileReference]);

  return url;
}

export const AdminDashboardPage: React.FC<AdminDashboardPageProps> = ({ onOpenAuth, onNavigate }) => {
  const {
    currentUser,
    allUsers,
    profilesLoadError,
    spaces,
    reservations,
    disputes,
    adminApproveKyc,
    adminRejectKyc,
    adminToggleSpaceStatus,
    reloadSpaces,
    updateSpace,
    adminResolveDispute,
    switchUser,
  } = useApp();

  const [activeTab, setActiveTab] = useState<
    'overview' | 'users' | 'kyc' | 'spaces' | 'disputes' | 'transactions' | 'audit' | 'reports' | 'kpi' | 'discounts' | 'payments'
  >('overview');

  // Filtros de Usuarios y KYC
  const [userSearch, setUserSearch] = useState('');
  const [kycStatusFilter, setKycStatusFilter] = useState<'all' | 'pending_review' | 'verified' | 'tenant' | 'owner'>('all');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [rejectingUserId, setRejectingUserId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Visor Modal de Imágenes y Certificado PDF
  const [previewImage, setPreviewImage] = useState<{ title: string; url: string } | null>(null);
  const [previewPdfCertificateUserId, setPreviewPdfCertificateUserId] = useState<string | null>(null);

  // Filtros de Espacios
  const [spaceSearch, setSpaceSearch] = useState('');
  const [detailSpaceId, setDetailSpaceId] = useState<string | null>(null);
  const detailSpace = detailSpaceId ? spaces.find((s) => s.id === detailSpaceId) ?? null : null;
  // El administrador puede corregir un espacio antes de aprobarlo.
  const [editingSpaceId, setEditingSpaceId] = useState<string | null>(null);
  const editingSpace = editingSpaceId ? spaces.find((s) => s.id === editingSpaceId) ?? null : null;
  const [spaceStatusFilter, setSpaceStatusFilter] = useState<'all' | 'active' | 'paused' | 'pending_approval'>('all');

  // Filtros de Disputas
  const [disputeFilter, setDisputeFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({});

  // Métricas operativas consolidadas
  const metrics = useMemo(() => {
    let totalGmvClp = 0;
    let totalPlatformFeeClp = 0;

    reservations.forEach((r) => {
      if (r.status === 'confirmed' || r.status === 'completed') totalGmvClp += r.totalClp;
      const l = reservationLedger(r);
      if (!l.pending) totalPlatformFeeClp += l.platformRevenueClp;
    });

    const nonAdminUsers = allUsers.filter((u) => u.role !== 'admin');
    const pendingVerifications = nonAdminUsers.filter(
      (u) => u.verificationStatus === 'pending_review' || u.verificationStatus === 'in_progress'
    ).length;
    const verifiedUsers = nonAdminUsers.filter((u) => u.verificationStatus === 'verified').length;
    const activeSpaces = spaces.filter((s) => s.status === 'active').length;
    const openDisputes = disputes.filter(
      (d) => d.status === 'pending' || d.status === 'investigating'
    ).length;

    return {
      totalGmvClp,
      totalPlatformFeeClp,
      totalUsers: nonAdminUsers.length,
      pendingVerifications,
      verifiedUsers,
      activeSpaces,
      totalSpaces: spaces.length,
      openDisputes,
    };
  }, [reservations, allUsers, spaces, disputes]);

  // Lista filtrada de usuarios (excluyendo al propio admin)
  const filteredUsers = useMemo(() => {
    return allUsers
      .filter((u) => u.role !== 'admin')
      .filter((u) => {
        if (kycStatusFilter === 'pending_review') {
          return u.verificationStatus === 'pending_review' || u.verificationStatus === 'in_progress';
        }
        if (kycStatusFilter === 'verified') {
          return u.verificationStatus === 'verified';
        }
        if (kycStatusFilter === 'tenant') {
          return u.role === 'tenant' && !u.ownerTermsAccepted;
        }
        if (kycStatusFilter === 'owner') {
          return u.role === 'owner' || u.ownerTermsAccepted;
        }
        return true;
      })
      .filter((u) => {
        if (!userSearch.trim()) return true;
        const q = userSearch.toLowerCase();
        return (
          u.fullName.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.rut.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (a.verificationStatus === 'pending_review' && b.verificationStatus !== 'pending_review') return -1;
        if (a.verificationStatus !== 'pending_review' && b.verificationStatus === 'pending_review') return 1;
        return 0;
      });
  }, [allUsers, kycStatusFilter, userSearch]);

  // Usuario activo seleccionado para inspección de expediente y comparación
  const selectedUser = useMemo(() => {
    if (selectedUserId) {
      const found = allUsers.find((u) => u.id === selectedUserId);
      if (found) return found;
    }
    return filteredUsers[0] || null;
  }, [allUsers, selectedUserId, filteredUsers]);

  // Situación tributaria (simulada) del usuario en revisión: necesaria para publicar amoblado.
  const [selectedTax, setSelectedTax] = useState<TaxStatus | null>(null);
  const [taxBusy, setTaxBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    setSelectedTax(null);
    if (selectedUser?.id) getTaxStatus(selectedUser.id).then((t) => alive && setSelectedTax(t));
    return () => {
      alive = false;
    };
  }, [selectedUser?.id]);
  // Nómina para el SII (Ley 21.713): situación de cada propietario, declaraciones de
  // no obligado y anticipos de IVA retenidos.
  const downloadTaxRoster = async () => {
    try {
      const rows = await getTaxRoster();
      downloadCsv(`Nomina_tributaria_Spotly_${new Date().toISOString().slice(0, 10)}.csv`, [
        ['Nombre', 'RUT', 'Correo', 'Inicio de actividades', 'Cumplimiento al día', 'Declaró no obligado', 'Carpeta tributaria', 'Última revisión', 'Carpeta vencida (90 días)', 'Espacios', 'Amoblados', 'Anticipo IVA retenido (CLP)'],
        ...rows.map((t) => [
          t.fullName, t.rut, t.email, t.hasActivity ? 'Sí' : 'No', t.upToDate ? 'Sí' : 'No', t.exemptDeclared ? 'Sí' : 'No',
          ({ none: 'No subida', pending: 'Por revisar', reviewed: 'Revisada', rejected: 'Rechazada' } as const)[t.certificateStatus],
          t.checkedAt ? new Date(t.checkedAt).toLocaleDateString('es-CL') : '', t.reviewDue ? 'Sí' : 'No', t.spacesCount, t.furnishedCount, t.withheldClp,
        ]),
      ]);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'No se pudo generar la nómina.');
    }
  };
  const viewTaxCertificate = async () => {
    if (!selectedTax?.certificatePath) return;
    const url = await getTaxCertificateUrl(selectedTax.certificatePath);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    else window.alert('No se pudo abrir la carpeta tributaria.');
  };
  const rejectTaxCertificate = async () => {
    if (!selectedUser) return;
    const note = window.prompt('¿Por qué rechazas el archivo? (el propietario verá este motivo)', 'El archivo no se puede leer');
    if (!note?.trim()) return;
    setTaxBusy(true);
    const r = await adminRejectTaxCertificate(selectedUser.id, note.trim());
    setTaxBusy(false);
    if (r.success && r.status) setSelectedTax(r.status);
    else window.alert(r.message || 'No se pudo rechazar.');
  };
  const setTax = async (hasActivity: boolean, upToDate = hasActivity) => {
    if (!selectedUser) return;
    setTaxBusy(true);
    const r = await adminSetTaxStatus(selectedUser.id, hasActivity, upToDate);
    setTaxBusy(false);
    if (r.success && r.status) setSelectedTax(r.status);
    else window.alert(r.message || 'No se pudo guardar.');
  };

  // Usuario para el modal de certificado PDF
  const pdfModalUser = useMemo(() => {
    if (!previewPdfCertificateUserId) return null;
    return allUsers.find((u) => u.id === previewPdfCertificateUserId) || null;
  }, [allUsers, previewPdfCertificateUserId]);
  const frontReviewUrl = useKycReviewUrl(selectedUser?.kycData?.idFrontUrl);
  const backReviewUrl = useKycReviewUrl(selectedUser?.kycData?.idBackUrl);
  const faceReviewUrl = useKycReviewUrl(selectedUser?.kycData?.photoUrl);
  const criminalRecordReviewUrl = useKycReviewUrl(selectedUser?.kycData?.criminalRecordUrl);
  const criminalRecordUrl = useKycReviewUrl(pdfModalUser?.kycData?.criminalRecordUrl);
  const criminalRecordIsPdf =
    criminalRecordUrl.startsWith('data:application/pdf') || /\.pdf(?:$|[?#])/i.test(criminalRecordUrl);

  // Lista filtrada de espacios
  const filteredSpaces = useMemo(() => {
    return [...spaces]
      // Los que esperan aprobación van primero.
      .sort((a, b) => Number(b.status === 'pending_approval') - Number(a.status === 'pending_approval'))
      .filter((s) => {
        if (spaceStatusFilter === 'all') return true;
        return s.status === spaceStatusFilter;
      })
      .filter((s) => {
        if (!spaceSearch.trim()) return true;
        const q = spaceSearch.toLowerCase();
        return (
          s.title.toLowerCase().includes(q) ||
          s.commune.toLowerCase().includes(q) ||
          s.ownerName.toLowerCase().includes(q)
        );
      });
  }, [spaces, spaceStatusFilter, spaceSearch]);

  // Lista filtrada de disputas
  const filteredDisputes = useMemo(() => {
    return disputes.filter((d) => {
      if (disputeFilter === 'open') {
        return d.status === 'pending' || d.status === 'investigating';
      }
      if (disputeFilter === 'resolved') {
        return d.status === 'resolved_refund' || d.status === 'resolved_owner';
      }
      return true;
    });
  }, [disputes, disputeFilter]);

  // Solo se llega aquí siendo admin (la ruta muestra «Página no encontrada» al resto).
  // Si la sesión se cierra mientras se ve el panel, no se dibuja nada que lo delate.
  if (!currentUser || currentUser.role !== 'admin') return null;

  const handleConfirmRejectUser = (userId: string) => {
    if (!rejectReason.trim()) return;
    adminRejectKyc(userId, rejectReason.trim());
    setRejectingUserId(null);
    setRejectReason('');
  };

  return (
    <div>
      <DashboardShell
        area="Administración"
        storageKey="spotly-admin-menu-collapsed"
        active={activeTab}
        onSelect={(id) => setActiveTab(id as typeof activeTab)}
        onNavigate={onNavigate}
        sections={[
          { label: 'General', items: [{ id: 'overview', label: 'Resumen', icon: LayoutDashboard }] },
          {
            label: 'Operación',
            items: [
              { id: 'users', label: 'Usuarios', icon: UserSearch },
              { id: 'kyc', label: 'Verificación KYC', icon: ShieldCheck, badge: metrics.pendingVerifications || undefined },
              {
                id: 'spaces',
                label: 'Espacios',
                icon: Building,
                ...(spaces.some((x) => x.status === 'pending_approval')
                  ? { badge: spaces.filter((x) => x.status === 'pending_approval').length }
                  : { count: metrics.totalSpaces }),
              },
              { id: 'disputes', label: 'Disputas', icon: Scale, badge: metrics.openDisputes || undefined },
            ],
          },
          {
            label: 'Dinero',
            items: [
              { id: 'transactions', label: 'Ganancias', icon: TrendingUp },
              { id: 'payments', label: 'Pagos Webpay', icon: CreditCard },
              { id: 'discounts', label: 'Códigos de descuento', icon: TicketPercent },
            ],
          },
          {
            label: 'Control',
            items: [
              { id: 'audit', label: 'Auditoría', icon: FileCheck2 },
              { id: 'reports', label: 'Reportes y cuentas', icon: Users },
              { id: 'kpi', label: 'KPI', icon: Gauge },
            ],
          },
          {
            label: 'Sitio',
            items: [
              { id: 'go-catalog', label: 'Catálogo público', icon: Search, action: () => onNavigate('home') },
            ],
          },
        ]}
      >
      <TabPanel tabKey={activeTab} className="space-y-6">
      {activeTab === 'overview' && (
        <AdminOverview
          todayIso={getTodayIso()}
          users={allUsers}
          spaces={spaces}
          reservations={reservations}
          disputes={disputes}
          onGoTab={(tab) => setActiveTab(tab)}
        />
      )}
      {activeTab === 'audit' && <AuditPanel />}
      {activeTab === 'users' && <AdminUserLookup />}
      {activeTab === 'reports' && <ReportsPanel />}
      {activeTab === 'kpi' && <KpiDashboard />}
      {activeTab === 'payments' && <PaymentsPanel />}
      {activeTab === 'discounts' && <DiscountCodesPanel />}

      {/* ===================================================================== */}
      {/* MÓDULO 1: VERIFICACIÓN KYC, COMPARACIÓN DE DATOS Y CERTIFICADO PDF    */}
      {/* ===================================================================== */}
      {activeTab === 'kyc' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Columna Izquierda: Lista de Usuarios (4 columnas en Desktop) */}
          <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="sr-only">Expedientes de usuarios</h2>
                <span className="text-xs font-semibold text-slate-500 tabular-nums">
                  {filteredUsers.length} registros
                </span>
                <button
                  type="button"
                  onClick={downloadTaxRoster}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  title="Nómina de propietarios para el SII (Ley 21.713)"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" /> Nómina SII
                </button>
              </div>

              {profilesLoadError && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">No se pudo consultar la lista de usuarios. Revisa la conexión a Supabase y la política de acceso a perfiles. {profilesLoadError}</div>}

              {/* Buscador */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Buscar por nombre, RUT o email..."
                  className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Filtros rápidos */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {[
                  { id: 'all', label: 'Todos' },
                  { id: 'pending_review', label: 'En revisión' },
                  { id: 'verified', label: 'Verificados' },
                  { id: 'owner', label: 'Propietarios' },
                  { id: 'tenant', label: 'Arrendatarios' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setKycStatusFilter(f.id as any)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                      kycStatusFilter === f.id
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Lista seleccionable */}
            <div className="divide-y divide-slate-100 max-h-[680px] overflow-y-auto">
              {filteredUsers.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No se encontraron usuarios con ese criterio.
                </div>
              ) : (
                filteredUsers.map((u) => {
                  const isSelected = selectedUser?.id === u.id;
                  const isOwner = u.role === 'owner' || u.ownerTermsAccepted;
                  return (
                    <button
                      key={u.id}
                      onClick={() => {
                        setSelectedUserId(u.id);
                        setRejectingUserId(null);
                      }}
                      className={`w-full text-left p-3.5 flex items-center justify-between gap-3 transition cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-300'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div aria-hidden="true" className="w-10 h-10 rounded-full bg-slate-100 shrink-0 ring-1 ring-slate-200" />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 truncate">
                            {u.fullName}
                          </div>
                          <div className="text-xs text-slate-500 font-mono truncate">
                            RUT <Sensitive kind="rut" value={u.rut} noReveal />
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span
                              className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                                isOwner
                                  ? 'bg-amber-50 text-amber-800'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {isOwner ? 'Propietario' : 'Arrendatario'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0">
                        {u.verificationStatus === 'verified' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" /> Verificado
                          </span>
                        ) : u.verificationStatus === 'pending_review' ||
                          u.verificationStatus === 'in_progress' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                            <Clock className="w-3 h-3" /> Por revisar
                          </span>
                        ) : u.verificationStatus === 'rejected' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700">
                            <XCircle className="w-3 h-3" /> Rechazado
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">
                            Sin enviar
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Columna Derecha: Comparador de Datos + Imágenes + Certificado PDF (8 columnas) */}
          <div className="lg:col-span-8">
            {!selectedUser ? (
              <div className="bg-white rounded-2xl border border-slate-200/90 p-12 text-center text-xs text-slate-500">
                Selecciona un usuario de la lista para comparar sus datos y visualizar su documentación.
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden space-y-6 p-5 sm:p-6">
                {/* Cabecera del Expediente y Botones de Dictamen */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
                  <div className="flex items-center gap-3.5">
                    <div aria-hidden="true" className="w-14 h-14 rounded-2xl bg-slate-100 ring-2 ring-slate-100" />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base sm:text-lg font-bold text-slate-900">
                          {selectedUser.fullName}
                        </h3>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            selectedUser.verificationStatus === 'verified'
                              ? 'bg-emerald-100 text-emerald-800'
                              : selectedUser.verificationStatus === 'pending_review'
                              ? 'bg-amber-100 text-amber-800'
                              : selectedUser.verificationStatus === 'rejected'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {selectedUser.verificationStatus === 'verified'
                            ? 'Identidad aprobada'
                            : selectedUser.verificationStatus === 'pending_review'
                            ? 'Pendiente de aprobación'
                            : selectedUser.verificationStatus === 'rejected'
                            ? 'Rechazado'
                            : 'Sin documentos'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        <Sensitive kind="email" value={selectedUser.email} /> · Tel: <Sensitive kind="phone" value={selectedUser.phone} />
                      </p>
                    </div>
                  </div>

                  {/* Acciones principales de Aprobación / Rechazo */}
                  <div className="flex items-center gap-2 shrink-0">
                    {selectedUser.verificationStatus !== 'verified' && (
                      <button
                        onClick={() => {
                          adminApproveKyc(selectedUser.id);
                          setRejectingUserId(null);
                        }}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                        <span>Aprobar verificación</span>
                      </button>
                    )}

                    {selectedUser.verificationStatus !== 'rejected' && (
                      <button
                        onClick={() =>
                          setRejectingUserId(
                            rejectingUserId === selectedUser.id ? null : selectedUser.id
                          )
                        }
                        className="px-3.5 py-2 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>
                          {selectedUser.verificationStatus === 'verified'
                            ? 'Revocar'
                            : 'Rechazar'}
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Caja de motivo de rechazo inline */}
                {rejectingUserId === selectedUser.id && (
                  <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 space-y-3">
                    <label className="block text-xs font-bold text-rose-900">
                      Indica el motivo del rechazo o revocación para notificar al usuario:
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Ej. Foto de cédula borrosa o certificado de antecedentes vencido..."
                        className="flex-1 px-3 py-2 bg-white border border-rose-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                      />
                      <button
                        onClick={() => handleConfirmRejectUser(selectedUser.id)}
                        className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition cursor-pointer shrink-0"
                      >
                        Confirmar rechazo
                      </button>
                    </div>
                  </div>
                )}

                {selectedUser.verificationStatus === 'rejected' && (
                  <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-1">
                    <div className="font-bold flex items-center gap-1.5 text-rose-800">
                      <XCircle className="w-4 h-4 text-rose-600" />
                      Motivo de rechazo informado al usuario:
                    </div>
                    <p className="text-rose-700 font-medium">
                      "{selectedUser.kycRejectionReason || selectedUser.kycData?.rejectionReason || 'Documentación rechazada por observaciones.'}"
                    </p>
                  </div>
                )}

                {/* =============================================================== */}
                {/* SECCIÓN 1: CUADRO COMPARATIVO DE DATOS (COTEJO LADO A LADO)     */}
                {/* =============================================================== */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <ArrowLeftRight className="w-4 h-4 text-indigo-600" />
                      1. Comparación de Datos: Perfil Registrado vs. Documentos y Biometría
                    </h4>
                    <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                      Revisión manual pendiente
                    </span>
                  </div>

                  {(() => {
                    const certFilename =
                      selectedUser.kycData?.criminalRecordDocCode ||
                      `Certificado_Antecedentes_${selectedUser.rut.replace(/\D/g, '')}.pdf`;

                    return (
                      <div className="border border-slate-200 rounded-2xl overflow-hidden">
                        <div className="relative overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500">
                                <th className="py-2.5 px-4">Campo evaluado</th>
                                <th className="py-2.5 px-4">Datos declarados en cuenta</th>
                                <th className="py-2.5 px-4">Revisión del administrador</th>
                                <th className="py-2.5 px-4 text-right">Resultado</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              <tr className="hover:bg-slate-50/60">
                                <td className="py-2.5 px-4 font-semibold text-slate-700">Nombre titular</td>
                                <td className="py-2.5 px-4 font-bold text-slate-900">{selectedUser.fullName}</td>
                                <td className="py-2.5 px-4 text-amber-700">Pendiente de cotejo visual</td>
                                <td className="py-2.5 px-4 text-right">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700">
                                    Pendiente
                                  </span>
                                </td>
                              </tr>

                              <tr className="hover:bg-slate-50/60">
                                <td className="py-2.5 px-4 font-semibold text-slate-700">RUN / RUT chileno</td>
                                <td className="py-2.5 px-4 font-mono font-bold text-slate-900"><Sensitive kind="rut" value={selectedUser.rut} /></td>
                                <td className="py-2.5 px-4 text-amber-700">Pendiente de lectura del documento</td>
                                <td className="py-2.5 px-4 text-right">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700">Pendiente</span>
                                </td>
                              </tr>

                              <tr className="hover:bg-slate-50/60">
                                <td className="py-2.5 px-4 font-semibold text-slate-700">N° serie documento</td>
                                <td className="py-2.5 px-4 text-slate-500">Cédula adjunta</td>
                                <td className="py-2.5 px-4 font-mono font-bold text-slate-900">{selectedUser.kycData?.documentSerialNumber ? <Sensitive kind="serial" value={selectedUser.kycData.documentSerialNumber} /> : 'Pendiente de revisión'}</td>
                                <td className="py-2.5 px-4 text-right">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700">Pendiente</span>
                                </td>
                              </tr>

                              <tr className="hover:bg-slate-50/60">
                                <td className="py-2.5 px-4 font-semibold text-slate-700">Reconocimiento facial</td>
                                <td className="py-2.5 px-4 text-slate-600">Foto del carnet / perfil</td>
                                <td className="py-2.5 px-4 font-bold text-slate-900">
                                  {selectedUser.kycData?.photoCaptured ? 'Selfie adjunta' : 'Sin selfie'}
                                </td>
                                <td className="py-2.5 px-4 text-right">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700">Pendiente</span>
                                </td>
                              </tr>

                              <tr className="hover:bg-slate-50/60">
                                <td className="py-2.5 px-4 font-semibold text-slate-700">Certificado antecedentes</td>
                                <td className="py-2.5 px-4 text-slate-600">Fines especiales (Ley 19.628)</td>
                                <td className="py-2.5 px-4 font-mono text-slate-800 truncate max-w-[200px]" title="Nombre del archivo (los números se ocultan)">
                                  {certFilename.replace(/\d(?=\d{2})/g, '•')}
                                </td>
                                <td className="py-2.5 px-4 text-right">
                                  {selectedUser.kycData?.criminalRecordSubmitted ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700">
                                      Pendiente de revisar
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600">
                                      No adjunto
                                    </span>
                                  )}
                                </td>
                              </tr>

                              <tr className="hover:bg-slate-50/60">
                                <td className="py-2.5 px-4 font-semibold text-slate-700">Rol / residencia</td>
                                <td className="py-2.5 px-4 text-slate-700">
                                  {selectedUser.role === 'owner' || selectedUser.ownerTermsAccepted
                                    ? 'Propietario / anfitrión'
                                    : 'Arrendatario'}
                                </td>
                                <td className="py-2.5 px-4 text-slate-700">
                                  {selectedUser.commune ? `${selectedUser.commune}${selectedUser.city ? `, ${selectedUser.city}` : ''}` : 'Comuna no informada'}
                                </td>
                                <td className="py-2.5 px-4 text-right">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600">
                                    Declarado
                                  </span>
                                </td>
                              </tr>

                              <tr className="hover:bg-slate-50/60 align-top">
                                <td className="py-2.5 px-4 font-semibold text-slate-700">Situación tributaria (SII)</td>
                                <td className="py-2.5 px-4 text-slate-600">Inicio de actividades y cumplimiento (Ley 21.713, carpeta cada 90 días)</td>
                                <td className="py-2.5 px-4 text-slate-700">
                                  {!selectedTax ? (
                                    'Aún no sube su carpeta tributaria'
                                  ) : (
                                    <>
                                      {selectedTax.reviewStatus === 'pending'
                                        ? 'Subió su carpeta tributaria: falta revisarla'
                                        : selectedTax.reviewStatus === 'rejected'
                                          ? `Archivo rechazado: ${selectedTax.reviewNote || ''}`
                                          : selectedTax.hasActivity
                                            ? `Inicio de actividades · giro ${selectedTax.activityCode || '—'}${selectedTax.upToDate ? '' : ' · con incumplimientos'}`
                                            : selectedTax.exemptDeclared
                                              ? 'Declaró no estar obligado (solo sin amoblar)'
                                              : 'Sin inicio de actividades'}
                                      <span className="block text-xs text-slate-500">
                                        {selectedTax.certificateUploadedAt ? `Carpeta subida el ${new Date(selectedTax.certificateUploadedAt).toLocaleDateString('es-CL')}` : 'Sin carpeta tributaria'}
                                        {selectedTax.reviewedAt ? ` · revisada el ${new Date(selectedTax.reviewedAt).toLocaleDateString('es-CL')}` : ''}
                                        {selectedTax.hasActivity && taxReviewDue(selectedTax) ? ' · carpeta vencida (90 días)' : ''}
                                      </span>
                                    </>
                                  )}
                                  <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                                    {selectedTax?.certificatePath && (
                                      <button type="button" onClick={viewTaxCertificate} className="inline-flex items-center gap-1 font-semibold text-indigo-700 hover:underline cursor-pointer">
                                        <FileText className="h-3.5 w-3.5" aria-hidden="true" /> Ver carpeta tributaria
                                      </button>
                                    )}
                                    <a href={SII_THIRD_PARTY_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-indigo-700 hover:underline">
                                      Contrastar en el SII (situación de terceros) <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                                    </a>
                                  </span>
                                  <span className="mt-1.5 flex flex-wrap gap-1.5">
                                    <button type="button" disabled={taxBusy} onClick={() => setTax(true, true)} className="rounded-lg border border-emerald-300 px-2 py-0.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50 cursor-pointer">
                                      Al día
                                    </button>
                                    <button type="button" disabled={taxBusy} onClick={() => setTax(true, false)} className="rounded-lg border border-amber-300 px-2 py-0.5 text-xs font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50 cursor-pointer">
                                      Con incumplimiento
                                    </button>
                                    <button type="button" disabled={taxBusy} onClick={() => setTax(false, false)} className="rounded-lg border border-rose-300 px-2 py-0.5 text-xs font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-50 cursor-pointer">
                                      Sin inicio
                                    </button>
                                    {selectedTax?.certificatePath && selectedTax.reviewStatus !== 'rejected' && (
                                      <button type="button" disabled={taxBusy} onClick={rejectTaxCertificate} className="rounded-lg border border-slate-300 px-2 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer">
                                        Rechazar archivo
                                      </button>
                                    )}
                                  </span>
                                </td>
                                <td className="py-2.5 px-4 text-right">
                                  {(() => {
                                    const label = !selectedTax
                                      ? ['Sin carpeta', 'bg-slate-100 text-slate-600']
                                      : selectedTax.reviewStatus === 'pending'
                                        ? ['Por revisar', 'bg-sky-50 text-sky-700']
                                        : selectedTax.reviewStatus === 'rejected'
                                          ? ['Rechazada', 'bg-rose-50 text-rose-700']
                                          : taxStatusOk(selectedTax)
                                        ? ['Al día', 'bg-emerald-50 text-emerald-700']
                                        : selectedTax.hasActivity && taxReviewDue(selectedTax)
                                          ? ['Revisión pendiente', 'bg-amber-50 text-amber-700']
                                          : selectedTax.hasActivity
                                            ? ['Incumplimiento', 'bg-rose-50 text-rose-700']
                                            : selectedTax.exemptDeclared
                                              ? ['Declaró no obligado', 'bg-slate-100 text-slate-700']
                                              : ['Sin inicio', 'bg-rose-50 text-rose-700'];
                                    return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${label[1]}`}>{label[0]}</span>;
                                  })()}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* =============================================================== */}
                {/* SECCIÓN 2: IMÁGENES ENVIADAS (CÉDULA ANVERSO, REVERSO Y ROSTRO) */}
                {/* =============================================================== */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <ScanFace className="w-4 h-4 text-indigo-600" />
                      2. Imágenes Capturadas: Cédula de Identidad (Frente y Dorso) y Selfie Biométrica
                    </h4>
                    <span className="text-xs text-slate-500">
                      Haz clic en cualquier imagen para ampliarla
                    </span>
                  </div>

                  {(() => {
                    const frontImg = frontReviewUrl;
                    const backImg = backReviewUrl;
                    const faceImg = faceReviewUrl;

                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {/* 1. Cédula Frente */}
                        <div className="border border-slate-200 rounded-xl p-3 space-y-2.5 bg-slate-50/50">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                              <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                              Cédula anverso
                            </span>
                            <button
                              disabled={!frontImg}
                              onClick={() =>
                                setPreviewImage({
                                  title: `Cédula Anverso — ${selectedUser.fullName}`,
                                  url: frontImg,
                                })
                              }
                              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 enabled:cursor-pointer disabled:text-slate-400 disabled:cursor-not-allowed"
                            >
                              <Eye className="w-3.5 h-3.5" /> Ampliar
                            </button>
                          </div>
                          <div
                            onClick={() => frontImg &&
                              setPreviewImage({
                                title: `Cédula Anverso — ${selectedUser.fullName}`,
                                url: frontImg,
                              })
                            }
                            className={`aspect-16/10 rounded-lg overflow-hidden bg-slate-900 border border-slate-200 group relative ${frontImg ? 'cursor-pointer' : ''}`}
                          >
                            {frontImg ? <><img
                              src={frontImg}
                              alt="Cédula Anverso"
                              className="w-full h-full scale-110 object-cover blur-xl"
                            /><span className="absolute inset-0 flex items-center justify-center gap-1.5 bg-slate-900/25 text-xs font-semibold text-white"><Eye className="h-4 w-4" aria-hidden="true" /> Ver imagen</span></> : <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">Documento no disponible</div>}
                          </div>
                        </div>

                        {/* 2. Cédula Reverso */}
                        <div className="border border-slate-200 rounded-xl p-3 space-y-2.5 bg-slate-50/50">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5 text-indigo-600" />
                              Cédula reverso
                            </span>
                            <button
                              disabled={!backImg}
                              onClick={() =>
                                setPreviewImage({
                                  title: `Cédula Reverso — ${selectedUser.fullName}`,
                                  url: backImg,
                                })
                              }
                              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 enabled:cursor-pointer disabled:text-slate-400 disabled:cursor-not-allowed"
                            >
                              <Eye className="w-3.5 h-3.5" /> Ampliar
                            </button>
                          </div>
                          <div
                            onClick={() => backImg &&
                              setPreviewImage({
                                title: `Cédula Reverso — ${selectedUser.fullName}`,
                                url: backImg,
                              })
                            }
                            className={`aspect-16/10 rounded-lg overflow-hidden bg-slate-900 border border-slate-200 group relative ${backImg ? 'cursor-pointer' : ''}`}
                          >
                            {backImg ? <><img
                              src={backImg}
                              alt="Cédula Reverso"
                              className="w-full h-full scale-110 object-cover blur-xl"
                            /><span className="absolute inset-0 flex items-center justify-center gap-1.5 bg-slate-900/25 text-xs font-semibold text-white"><Eye className="h-4 w-4" aria-hidden="true" /> Ver imagen</span></> : <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">Documento no disponible</div>}
                          </div>
                        </div>

                        {/* 3. Selfie Biométrica */}
                        <div className="border border-slate-200 rounded-xl p-3 space-y-2.5 bg-slate-50/50">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                              <ScanFace className="w-3.5 h-3.5 text-emerald-600" />
                              Selfie biométrica
                            </span>
                            <button
                              disabled={!faceImg}
                              onClick={() =>
                                setPreviewImage({
                                  title: `Reconocimiento Facial en Vivo — ${selectedUser.fullName}`,
                                  url: faceImg,
                                })
                              }
                              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 enabled:cursor-pointer disabled:text-slate-400 disabled:cursor-not-allowed"
                            >
                              <Eye className="w-3.5 h-3.5" /> Ampliar
                            </button>
                          </div>
                          <div
                            onClick={() => faceImg &&
                              setPreviewImage({
                                title: `Reconocimiento Facial en Vivo — ${selectedUser.fullName}`,
                                url: faceImg,
                              })
                            }
                            className={`aspect-16/10 rounded-lg overflow-hidden bg-slate-900 border border-slate-200 group relative ${faceImg ? 'cursor-pointer' : ''}`}
                          >
                            {faceImg ? <><img
                              src={faceImg}
                              alt="Selfie Biométrica"
                              className="w-full h-full scale-110 object-cover blur-xl"
                            /><span className="absolute inset-0 flex items-center justify-center gap-1.5 bg-slate-900/25 text-xs font-semibold text-white"><Eye className="h-4 w-4" aria-hidden="true" /> Ver imagen</span></> : <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">Imagen no disponible</div>}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* =============================================================== */}
                {/* SECCIÓN 3: CERTIFICADO PDF DE ANTECEDENTES ENVIADO              */}
                {/* =============================================================== */}
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <FileCheck2 className="w-4 h-4 text-amber-600" />
                      3. Certificado de antecedentes adjunto
                    </h4>

                    <div className="flex items-center gap-2">
                      <button
                        disabled={!selectedUser.kycData?.criminalRecordUrl}
                        onClick={() => setPreviewPdfCertificateUserId(selectedUser.id)}
                        className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 transition enabled:cursor-pointer disabled:bg-slate-300 disabled:cursor-not-allowed shadow-2xs"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Ver adjunto del certificado
                      </button>
                      <a
                        href={criminalRecordReviewUrl || undefined}
                        target="_blank"
                        rel="noreferrer"
                        aria-disabled={!selectedUser.kycData?.criminalRecordUrl}
                        className={`px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition ${criminalRecordReviewUrl ? '' : 'opacity-50 pointer-events-none'}`}
                      >
                        <Download className="w-3.5 h-3.5 text-slate-500" />
                        Abrir archivo original
                      </a>
                    </div>
                  </div>

                  {/* Vista Previa Integrada del Documento PDF del Certificado */}
                  <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 sm:p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                          PDF
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-900">
                            {(selectedUser.kycData?.criminalRecordDocCode ||
                              `Certificado_Antecedentes_${selectedUser.rut.replace(/\D/g, '')}.pdf`).replace(/\d(?=\d{2})/g, '•')}
                          </div>
                          <div className="text-xs text-slate-500">
                            Servicio de registro civil e identificación · república de Chile
                          </div>
                        </div>
                      </div>

                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 self-start sm:self-auto">
                        Documento PDF verificado
                      </span>
                    </div>

                    {/* Hoja simulada o archivo subido del Certificado */}
                    <div
                      onClick={() => setPreviewPdfCertificateUserId(selectedUser.id)}
                      className="bg-white border border-slate-300 rounded-xl p-4 sm:p-5 shadow-2xs cursor-pointer hover:border-indigo-400 transition space-y-3"
                    >
                      <div className="flex items-start justify-between border-b-2 border-indigo-900 pb-3">
                        <div>
                          <div className="text-xs font-bold text-indigo-900">
                            República de Chile · servicio de registro civil e identificación
                          </div>
                          <div className="text-xs sm:text-sm font-bold text-slate-900 mt-0.5">
                            CERTIFICADO DE ANTECEDENTES PARA FINES ESPECIALES
                          </div>
                        </div>
                        <div className="text-right font-mono text-xs text-slate-500">
                          <div>FOLIO: 50049281</div>
                          <div>LEY N° 19.628</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
                        <div>
                          <span className="text-xs text-slate-500 font-bold block">
                            Nombre titular
                          </span>
                          <span className="font-bold text-slate-900">
                            {selectedUser.fullName.toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs text-slate-500 font-bold block">
                            RUN / RUT
                          </span>
                          <span className="font-mono font-bold text-indigo-900">
                            <Sensitive kind="rut" value={selectedUser.rut} />
                          </span>
                        </div>
                        <div>
                          <span className="text-xs text-slate-500 font-bold block">
                            Registro general de condenas
                          </span>
                          <span className="font-bold text-emerald-700">
                            SIN ANOTACIONES VIGENTES
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                        <span>Timbre electrónico avanzado (Ley 19.799)</span>
                        <span className="text-indigo-600 font-bold flex items-center gap-1">
                          <Eye className="w-3.5 h-3.5" /> Clic para abrir documento completo
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MÓDULO 2: MODERACIÓN DE ESPACIOS                                      */}
      {/* ===================================================================== */}
      {activeTab === 'spaces' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="sr-only">Catálogo y moderación de espacios</h2>
              <p className="text-xs text-slate-500">
                Aprueba los espacios nuevos (con la carpeta tributaria del propietario), edítalos, actívalos o páusalos.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={spaceSearch}
                  onChange={(e) => setSpaceSearch(e.target.value)}
                  placeholder="Buscar espacio, comuna o dueño..."
                  className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                {[
                  { id: 'all', label: 'Todos' },
                  { id: 'pending_approval', label: `Por aprobar (${spaces.filter((x) => x.status === 'pending_approval').length})` },
                  { id: 'active', label: 'Activos' },
                  { id: 'paused', label: 'Pausados' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setSpaceStatusFilter(f.id as any)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      spaceStatusFilter === f.id
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {filteredSpaces.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-500">
                No se encontraron espacios para el filtro seleccionado.
              </div>
            ) : (
              filteredSpaces.map((sp) => {
                const rate = getSpaceRateInfo(sp);
                return (
                  <div
                    key={sp.id}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <button
                        type="button"
                        onClick={() => setDetailSpaceId(sp.id)}
                        className="shrink-0 rounded-xl overflow-hidden cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                        aria-label={`Ver detalle de ${sp.title}`}
                      >
                        <img
                          src={sp.images[0]}
                          alt={sp.title}
                          className="w-16 h-14 object-cover bg-slate-100"
                        />
                      </button>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-slate-900 truncate">
                            {sp.title}
                          </h3>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                              sp.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700'
                                : sp.status === 'pending_approval'
                                  ? 'bg-amber-50 text-amber-800'
                                  : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {sp.status === 'active' ? 'Activo' : sp.status === 'pending_approval' ? 'Por aprobar' : 'Pausado'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-500" />
                            {sp.commune}
                          </span>
                          <span>
                            Propietario: <strong className="text-slate-700">{sp.ownerName}</strong> (<Sensitive kind="rut" value={sp.ownerRut} noReveal />)
                          </span>
                          <span className="font-bold text-slate-900">
                            {formatClp(rate.amount)} {rate.unitLabel}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => setDetailSpaceId(sp.id)}
                        className="px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer bg-indigo-600 text-white hover:bg-indigo-700 inline-flex items-center gap-1.5"
                      >
                        <Eye className="w-3.5 h-3.5" /> {sp.status === 'pending_approval' ? 'Revisar y aprobar' : 'Ver y gestionar'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MÓDULO 3: RESOLUCIÓN DE DISPUTAS                                      */}
      {/* ===================================================================== */}
      {activeTab === 'disputes' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="sr-only">Centro de arbitraje y garantías</h2>
              <p className="text-xs text-slate-500">
                Resuelve reclamos entre arrendatarios y propietarios sobre el pago retenido en custodia (arriendo + garantía + comisión Spotly del 5 %).
              </p>
            </div>

            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-start sm:self-auto">
              {[
                { id: 'all', label: 'Todas' },
                { id: 'open', label: 'En arbitraje' },
                { id: 'resolved', label: 'Resueltas' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setDisputeFilter(f.id as any)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    disputeFilter === f.id
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Guía de cómo funciona el Reembolso y la Custodia en Spotly */}
          <div className="px-4 sm:px-5 py-3.5 bg-slate-50/90 border-b border-slate-200/80 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-white border border-slate-200/90 space-y-1">
              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                <Banknote className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>1. ¿Qué incluye el Monto en Custodia?</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Cuando el arrendatario paga, Spotly retiene en custodia: <strong>Valor hora/Día</strong> + <strong>Garantía de daños</strong> + <strong>comisión Spotly del 5 %</strong> que paga el arrendatario.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200/80 space-y-1">
              <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>2. Si reembolsas al Arrendatario</span>
              </div>
              <p className="text-xs text-emerald-800 leading-relaxed">
                Por falla del lugar (ej. corte de luz, recinto cerrado), se devuelve el <strong>100% de todo lo pagado</strong> (arriendo + garantía + comisión Spotly). Spotly devuelve también su 5 %.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-200/80 space-y-1">
              <div className="font-bold text-indigo-900 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>3. Si liberas al Propietario</span>
              </div>
              <p className="text-xs text-indigo-800 leading-relaxed">
                Si hubo daños o el reclamo no procede, el propietario recibe el <strong>arriendo (menos su comisión, si le corresponde) + la garantía</strong>, y Spotly se queda con el <strong>comisión Spotly del 5 %</strong>.
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {filteredDisputes.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-500">
                No hay disputas registradas en este estado.
              </div>
            ) : (
              filteredDisputes.map((d) => {
                const isResolved =
                  d.status === 'resolved_refund' || d.status === 'resolved_owner';
                const linkedRes = reservations.find((r) => r.id === d.reservationId);

                // Desglose: arriendo + garantía + comisión Spotly del 5 %
                const rentalSubtotal =
                  d.subtotalClp ?? linkedRes?.subtotalClp ?? (d.id === 'disp-001' ? 120000 : Math.round(d.amountClp * 0.65));
                const securityDeposit =
                  d.securityDepositClp ?? linkedRes?.securityDepositClp ?? (d.id === 'disp-001' ? 60000 : Math.round(d.amountClp * 0.3));
                const platformFee5Pct =
                  d.platformFeeClp ?? linkedRes?.platformFeeClp ?? Math.round(rentalSubtotal * 0.05);
                const totalCustody = rentalSubtotal + securityDeposit + platformFee5Pct;
                // El propietario recibe el arriendo menos SU comisión (congelada en la reserva).
                const ownerNetIfReleased = rentalSubtotal - (linkedRes?.ownerCommissionClp ?? 0) + securityDeposit;

                return (
                  <div key={d.id} className="p-4 sm:p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-slate-500">
                          #{d.id}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            isResolved
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {d.status === 'resolved_refund'
                            ? 'Resuelta · reembolso 100% al arrendatario'
                            : d.status === 'resolved_owner'
                            ? 'Resuelta · liberado al propietario'
                            : 'En arbitraje'}
                        </span>
                        <h3 className="text-sm font-bold text-slate-900">
                          {d.spaceTitle}
                        </h3>
                      </div>

                      <div className="text-sm font-bold text-rose-600 tabular-nums">
                        Total en Custodia: {formatClp(totalCustody)}
                      </div>
                    </div>

                    {/* Desglose Financiero Transparente de la Reserva en Disputa */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3.5 rounded-xl bg-indigo-50/40 border border-indigo-100 text-xs">
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200/80">
                        <span className="text-xs font-bold text-slate-500 block">
                          1. Valor Hora / Día
                        </span>
                        <strong className="text-sm font-bold text-slate-900 tabular-nums">
                          {formatClp(rentalSubtotal)}
                        </strong>
                        <span className="block text-xs text-slate-500 mt-0.5">
                          Tarifa base del espacio
                        </span>
                      </div>

                      <div className="bg-white p-2.5 rounded-lg border border-slate-200/80">
                        <span className="text-xs font-bold text-slate-500 block">
                          2. Garantía en Custodia
                        </span>
                        <strong className="text-sm font-bold text-slate-900 tabular-nums">
                          {formatClp(securityDeposit)}
                        </strong>
                        <span className="block text-xs text-slate-500 mt-0.5">
                          Caución por daños
                        </span>
                      </div>

                      <div className="bg-white p-2.5 rounded-lg border border-slate-200/80">
                        <span className="text-xs font-bold text-slate-500 block">
                          3. Comisión Spotly 5 % (con IVA)
                        </span>
                        <strong className="text-sm font-bold text-indigo-700 tabular-nums">
                          {formatClp(platformFee5Pct)}
                        </strong>
                        <span className="block text-xs text-slate-500 mt-0.5">
                          {d.status === 'resolved_refund' ? 'Devuelto al cliente' : 'Lo paga el arrendatario'}
                        </span>
                      </div>

                      <div className="bg-white p-2.5 rounded-lg border border-rose-200">
                        <span className="text-xs font-bold text-rose-600 block">
                          Total pagado (1 + 2 + 3)
                        </span>
                        <strong className="text-sm font-bold text-rose-700 tabular-nums">
                          {formatClp(totalCustody)}
                        </strong>
                        <span className="block text-xs text-slate-500 mt-0.5">
                          {d.status === 'resolved_refund'
                            ? `Reembolsado: ${formatClp(totalCustody)}`
                            : d.status === 'resolved_owner'
                            ? `Al dueño: ${formatClp(ownerNetIfReleased)}`
                            : 'Retenido en bóveda'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                      <div>
                        <span className="text-slate-500 block">Arrendatario</span>
                        <strong className="text-slate-800">{d.tenantName}</strong>
                        <span className="block text-xs text-slate-500 font-mono">
                          RUT <Sensitive kind="rut" value={d.tenantRut} />
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Propietario</span>
                        <strong className="text-slate-800">{d.ownerName}</strong>
                        <span className="block text-xs text-slate-500 font-mono">
                          RUT <Sensitive kind="rut" value={d.ownerRut} />
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Motivo del reclamo</span>
                        <p className="text-slate-700 mt-0.5 leading-snug">{d.reason}</p>
                      </div>
                    </div>

                    {isResolved ? (
                      <div className="text-xs text-emerald-800 bg-emerald-50/70 border border-emerald-200/80 px-3.5 py-2.5 rounded-xl space-y-1">
                        <div>
                          <strong>Dictamen final:</strong> {d.resolutionNotes}
                        </div>
                        <div className="text-xs text-emerald-900 font-medium">
                          {d.status === 'resolved_refund' ? (
                            <>
                              <strong>Liquidación ejecutada:</strong> Se reembolsó el 100% al arrendatario ({formatClp(totalCustody)}: {formatClp(rentalSubtotal)} de arriendo + {formatClp(securityDeposit)} de garantía + {formatClp(platformFee5Pct)} de la comisión Spotly).
                            </>
                          ) : (
                            <>
                              <strong>Liquidación ejecutada:</strong> Se liberó al propietario {formatClp(ownerNetIfReleased)} (arriendo menos su comisión + garantía de {formatClp(securityDeposit)}) y Spotly se quedó con la comisión Spotly ({formatClp(platformFee5Pct)}).
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
                        <input
                          type="text"
                          placeholder="Escribir dictamen o nota de resolución..."
                          value={resolutionNotes[d.id] || ''}
                          onChange={(e) =>
                            setResolutionNotes((prev) => ({
                              ...prev,
                              [d.id]: e.target.value,
                            }))
                          }
                          className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <button
                            onClick={() =>
                              adminResolveDispute(
                                d.id,
                                'resolved_refund',
                                resolutionNotes[d.id] ||
                                  'Fallo a favor del arrendatario por incumplimiento del recinto. Se reembolsa 100% (arriendo + garantía + comisión Spotly).'
                              )
                            }
                            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition cursor-pointer"
                          >
                            Reembolsar 100% a Arrendatario ({formatClp(totalCustody)})
                          </button>
                          <button
                            onClick={() =>
                              adminResolveDispute(
                                d.id,
                                'resolved_owner',
                                resolutionNotes[d.id] ||
                                  'Fallo a favor del propietario. Se libera arriendo y garantía al anfitrión.'
                              )
                            }
                            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition cursor-pointer"
                          >
                            Liberar a Propietario ({formatClp(ownerNetIfReleased)})
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MÓDULO 4: VOLUMEN TRANSACCIONADO Y COMISIONES DE LA PLATAFORMA        */}
      {/* ===================================================================== */}
      {activeTab === 'transactions' && <PlatformFinancePanel />}
      </TabPanel>
      </DashboardShell>

      {/* Ficha completa de una publicación */}
      {detailSpace && (
        <AdminSpaceDetailModal
          space={detailSpace}
          reservations={reservations}
          onClose={() => setDetailSpaceId(null)}
          onToggleStatus={(id, status) => adminToggleSpaceStatus(id, status)}
          onEdit={(sp) => setEditingSpaceId(sp.id)}
          onReviewed={() => void reloadSpaces()}
        />
      )}
      {editingSpace &&
        createPortal(
          <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/70 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={`Editar ${editingSpace.title}`}>
            <div className="mx-auto max-w-3xl rounded-3xl bg-white shadow-2xl">
              <div className="flex items-start justify-between gap-3 rounded-t-3xl bg-slate-900 px-5 py-4 text-white">
                <div>
                  <p className="text-xs font-bold text-indigo-200">Edición por administración</p>
                  <h2 className="text-lg font-bold">{editingSpace.title}</h2>
                  <p className="text-xs text-slate-400">Corrige lo necesario; el propietario verá los cambios. Después puedes aprobarlo.</p>
                </div>
                <button type="button" onClick={() => setEditingSpaceId(null)} className="rounded-xl bg-white/10 p-1.5 hover:bg-white/20 cursor-pointer" aria-label="Cerrar">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-5">
                <PublishSpaceForm
                  key={editingSpace.id}
                  editingSpace={editingSpace}
                  asAdmin
                  onCancel={() => setEditingSpaceId(null)}
                  onSubmit={(data) => {
                    const { status: _status, isVerified: _verified, ...changes } = data;
                    updateSpace(editingSpace.id, changes);
                    setEditingSpaceId(null);
                  }}
                />
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Modal de Vista Ampliada de Imagen (Cédula / Biometría) */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">{previewImage.title}</h3>
              <button
                onClick={() => setPreviewImage(null)}
                className="p-1 text-slate-500 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 bg-slate-950 flex items-center justify-center max-h-[75vh] overflow-auto">
              <img
                src={previewImage.url}
                alt={previewImage.title}
                className="max-w-full max-h-[68vh] object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal de Visualización del Certificado PDF Completo */}
      {pdfModalUser && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setPreviewPdfCertificateUserId(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-3xl w-full overflow-hidden shadow-2xl border border-slate-200 my-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Barra superior del visor PDF */}
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-bold text-xs">
                  {criminalRecordIsPdf ? 'PDF' : 'IMG'}
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold truncate">
                    {(pdfModalUser.kycData?.criminalRecordDocCode ||
                      `Certificado_Antecedentes_${pdfModalUser.rut.replace(/\D/g, '')}.pdf`).replace(/\d(?=\d{2})/g, '•')}
                  </h3>
                  <p className="text-xs text-slate-500 truncate">
                    Expediente KYC · {pdfModalUser.fullName} (RUT <Sensitive kind="rut" value={pdfModalUser.rut} />)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={criminalRecordUrl || undefined}
                  target="_blank"
                  rel="noreferrer"
                  aria-disabled={!criminalRecordUrl}
                  className={`px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 transition ${criminalRecordUrl ? '' : 'opacity-50 pointer-events-none'}`}
                >
                  <Download className="w-3.5 h-3.5" />
                  Abrir archivo original
                </a>
                <button
                  onClick={() => setPreviewPdfCertificateUserId(null)}
                  className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Mostrar el adjunto real recibido, sin generar un certificado ficticio. */}
            <div className="p-6 sm:p-8 bg-slate-100 max-h-[75vh] overflow-y-auto">
              {!criminalRecordUrl ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
                  No hay un archivo adjunto disponible para esta solicitud.
                </div>
              ) : criminalRecordIsPdf ? (
                <iframe src={criminalRecordUrl} title="Certificado adjunto del usuario" className="w-full h-[70vh] rounded-xl border border-slate-300 bg-white" />
              ) : (
                <img src={criminalRecordUrl} alt="Certificado adjunto del usuario" className="max-w-full max-h-[70vh] mx-auto rounded-xl border border-slate-300 bg-white object-contain" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
