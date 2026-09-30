import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { formatClp, formatRut, getSpaceRateInfo } from '../utils/formatters.ts';
import { getSimulatedCedulaImage, getSimulatedFaceImage } from '../utils/mockAssets.ts';
import { downloadCriminalRecordCertificate } from '../utils/documentDownloader.ts';
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
} from 'lucide-react';

interface AdminDashboardPageProps {
  onOpenAuth?: (mode: 'login' | 'register', notice?: string) => void;
}

export const AdminDashboardPage: React.FC<AdminDashboardPageProps> = ({ onOpenAuth }) => {
  const {
    currentUser,
    allUsers,
    spaces,
    reservations,
    disputes,
    adminApproveKyc,
    adminRejectKyc,
    adminToggleSpaceStatus,
    adminResolveDispute,
    switchUser,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'kyc' | 'spaces' | 'disputes' | 'transactions'>('kyc');

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
  const [spaceStatusFilter, setSpaceStatusFilter] = useState<'all' | 'active' | 'paused' | 'pending_approval'>('all');

  // Filtros de Disputas
  const [disputeFilter, setDisputeFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({});

  // Métricas operativas consolidadas
  const metrics = useMemo(() => {
    let totalGmvClp = 0;
    let totalPlatformFeeClp = 0;

    reservations.forEach((r) => {
      if (r.status === 'confirmed' || r.status === 'completed') {
        totalGmvClp += r.totalClp;
        totalPlatformFeeClp += r.platformFeeClp;
      }
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

  // Usuario para el modal de certificado PDF
  const pdfModalUser = useMemo(() => {
    if (!previewPdfCertificateUserId) return null;
    return allUsers.find((u) => u.id === previewPdfCertificateUserId) || null;
  }, [allUsers, previewPdfCertificateUserId]);

  // Lista filtrada de espacios
  const filteredSpaces = useMemo(() => {
    return spaces
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

  // Guardia de acceso para usuarios no administradores
  if (!currentUser || currentUser.role !== 'admin') {
    return (
      <div className="max-w-xl mx-auto py-16 px-4">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-10 text-center shadow-sm space-y-6">
          <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto">
            <ShieldCheck className="w-7 h-7" />
          </div>

          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full">
              Acceso Restringido
            </span>
            <h2 className="text-2xl font-bold text-slate-900">
              Panel de Administración
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Esta sección está reservada para el equipo de administración de Spotly Chile.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            {!currentUser ? (
              <button
                onClick={() => onOpenAuth?.('login', 'Inicia sesión con credenciales de Administrador.')}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs transition cursor-pointer"
              >
                Iniciar Sesión
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const handleConfirmRejectUser = (userId: string) => {
    if (!rejectReason.trim()) return;
    adminRejectKyc(userId, rejectReason.trim());
    setRejectingUserId(null);
    setRejectReason('');
  };

  return (
    <div className="space-y-6 pb-16">
      {/* 1. CABECERA EJECUTIVA LIMPIA (Sin pestañas duplicadas arriba) */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
              <ShieldCheck className="w-3.5 h-3.5" />
              Administración Central
            </span>
            <span className="text-xs text-slate-400">·</span>
            <span className="text-xs text-slate-500 font-medium">
              {currentUser.fullName}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1 tracking-tight">
            Panel de Control y Verificación KYC
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Haz clic en cualquiera de las tarjetas inferiores para cambiar de vista: Verificación KYC, Espacios Activos, Disputas en Arbitraje o Volumen Transaccionado.
          </p>
        </div>
      </div>

      {/* 2. TARJETAS INTERACTIVAS DE NAVEGACIÓN Y RESUMEN OPERATIVO (Haz clic para cambiar de pantalla) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Tarjeta 1: Revisiones KYC Pendientes -> Cambia a pantalla KYC */}
        <button
          type="button"
          onClick={() => setActiveTab('kyc')}
          className={`text-left p-4 sm:p-5 rounded-2xl border transition cursor-pointer flex flex-col justify-between ${
            activeTab === 'kyc'
              ? 'bg-white border-indigo-600 ring-2 ring-indigo-600/20 shadow-md'
              : 'bg-white border-slate-200/90 hover:border-indigo-300 hover:shadow-sm shadow-2xs'
          }`}
        >
          <div className="w-full">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 gap-2">
              <span>Revisiones KYC Pendientes</span>
              <Clock className={`w-4 h-4 shrink-0 ${activeTab === 'kyc' ? 'text-indigo-600' : 'text-amber-500'}`} />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-2 tabular-nums">
              {metrics.pendingVerifications}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {metrics.verifiedUsers} de {metrics.totalUsers} usuarios aprobados
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold w-full">
            <span className={activeTab === 'kyc' ? 'text-indigo-600' : 'text-slate-500'}>
              {activeTab === 'kyc' ? '● Pantalla activa' : 'Ver Verificación KYC'}
            </span>
            <span className={activeTab === 'kyc' ? 'text-indigo-600' : 'text-slate-400'}>→</span>
          </div>
        </button>

        {/* Tarjeta 2: Espacios Activos -> Cambia a pantalla Espacios */}
        <button
          type="button"
          onClick={() => setActiveTab('spaces')}
          className={`text-left p-4 sm:p-5 rounded-2xl border transition cursor-pointer flex flex-col justify-between ${
            activeTab === 'spaces'
              ? 'bg-white border-emerald-600 ring-2 ring-emerald-600/20 shadow-md'
              : 'bg-white border-slate-200/90 hover:border-emerald-300 hover:shadow-sm shadow-2xs'
          }`}
        >
          <div className="w-full">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 gap-2">
              <span>Espacios Activos</span>
              <Building className="w-4 h-4 text-emerald-600 shrink-0" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-2 tabular-nums">
              {metrics.activeSpaces}{' '}
              <span className="text-sm font-normal text-slate-400">/ {metrics.totalSpaces}</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Publicados en el catálogo nacional
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold w-full">
            <span className={activeTab === 'spaces' ? 'text-emerald-700' : 'text-slate-500'}>
              {activeTab === 'spaces' ? '● Pantalla activa' : 'Gestionar Espacios'}
            </span>
            <span className={activeTab === 'spaces' ? 'text-emerald-700' : 'text-slate-400'}>→</span>
          </div>
        </button>

        {/* Tarjeta 3: Disputas en Arbitraje -> Cambia a pantalla Disputas */}
        <button
          type="button"
          onClick={() => setActiveTab('disputes')}
          className={`text-left p-4 sm:p-5 rounded-2xl border transition cursor-pointer flex flex-col justify-between ${
            activeTab === 'disputes'
              ? 'bg-white border-rose-600 ring-2 ring-rose-600/20 shadow-md'
              : 'bg-white border-slate-200/90 hover:border-rose-300 hover:shadow-sm shadow-2xs'
          }`}
        >
          <div className="w-full">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 gap-2">
              <span>Disputas en Arbitraje</span>
              <Scale className="w-4 h-4 text-rose-600 shrink-0" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-2 tabular-nums">
              {metrics.openDisputes}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {disputes.length} casos registrados en total
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold w-full">
            <span className={activeTab === 'disputes' ? 'text-rose-600' : 'text-slate-500'}>
              {activeTab === 'disputes' ? '● Pantalla activa' : 'Revisar Disputas'}
            </span>
            <span className={activeTab === 'disputes' ? 'text-rose-600' : 'text-slate-400'}>→</span>
          </div>
        </button>

        {/* Tarjeta 4: Volumen Transaccionado -> Cambia a pantalla Transacciones */}
        <button
          type="button"
          onClick={() => setActiveTab('transactions')}
          className={`text-left p-4 sm:p-5 rounded-2xl border transition cursor-pointer flex flex-col justify-between ${
            activeTab === 'transactions'
              ? 'bg-white border-indigo-600 ring-2 ring-indigo-600/20 shadow-md'
              : 'bg-white border-slate-200/90 hover:border-indigo-300 hover:shadow-sm shadow-2xs'
          }`}
        >
          <div className="w-full">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 gap-2">
              <span>Volumen Transaccionado</span>
              <Banknote className="w-4 h-4 text-indigo-600 shrink-0" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-2 tabular-nums truncate">
              {formatClp(metrics.totalGmvClp)}
            </div>
            <div className="text-[11px] text-emerald-700 font-semibold mt-1 truncate">
              Comisión Spotly (5%): {formatClp(metrics.totalPlatformFeeClp)}
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold w-full">
            <span className={activeTab === 'transactions' ? 'text-indigo-600' : 'text-slate-500'}>
              {activeTab === 'transactions' ? '● Pantalla activa' : 'Ver Transacciones'}
            </span>
            <span className={activeTab === 'transactions' ? 'text-indigo-600' : 'text-slate-400'}>→</span>
          </div>
        </button>
      </div>

      {/* ===================================================================== */}
      {/* MÓDULO 1: VERIFICACIÓN KYC, COMPARACIÓN DE DATOS Y CERTIFICADO PDF    */}
      {/* ===================================================================== */}
      {activeTab === 'kyc' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Columna Izquierda: Lista de Usuarios (4 columnas en Desktop) */}
          <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900">Expedientes de Usuarios</h2>
                <span className="text-xs font-semibold text-slate-400 tabular-nums">
                  {filteredUsers.length} registros
                </span>
              </div>

              {/* Buscador */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
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
                  { id: 'pending_review', label: 'En Revisión' },
                  { id: 'verified', label: 'Verificados' },
                  { id: 'owner', label: 'Propietarios' },
                  { id: 'tenant', label: 'Arrendatarios' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setKycStatusFilter(f.id as any)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition cursor-pointer ${
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
                <div className="p-8 text-center text-xs text-slate-400">
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
                          ? 'bg-indigo-50/70 border-l-4 border-l-indigo-600'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div aria-hidden="true" className="w-10 h-10 rounded-full bg-slate-100 shrink-0 ring-1 ring-slate-200" />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 truncate">
                            {u.fullName}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono truncate">
                            RUT {formatRut(u.rut)}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
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
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" /> Verificado
                          </span>
                        ) : u.verificationStatus === 'pending_review' ||
                          u.verificationStatus === 'in_progress' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                            <Clock className="w-3 h-3" /> Por Revisar
                          </span>
                        ) : u.verificationStatus === 'rejected' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700">
                            <XCircle className="w-3 h-3" /> Rechazado
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500">
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
              <div className="bg-white rounded-2xl border border-slate-200/90 p-12 text-center text-xs text-slate-400">
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
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
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
                            ? 'Identidad Aprobada'
                            : selectedUser.verificationStatus === 'pending_review'
                            ? 'Pendiente de Aprobación'
                            : selectedUser.verificationStatus === 'rejected'
                            ? 'Rechazado'
                            : 'Sin Documentos'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {selectedUser.email} · Tel: {selectedUser.phone}
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
                        <span>Aprobar Verificación</span>
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
                        Confirmar Rechazo
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
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <ArrowLeftRight className="w-4 h-4 text-indigo-600" />
                      1. Comparación de Datos: Perfil Registrado vs. Documentos y Biometría
                    </h4>
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      Cotejo de Identidad Activo
                    </span>
                  </div>

                  {(() => {
                    const registeredRut = formatRut(selectedUser.rut);
                    const extractedRut = formatRut(selectedUser.kycData?.rutNumber || selectedUser.rut);
                    const rutMatches =
                      registeredRut.replace(/\D/g, '') === extractedRut.replace(/\D/g, '');
                    const bioScore =
                      selectedUser.kycData?.biometricScore ??
                      (selectedUser.kycData?.photoCaptured ? 98 : 0);
                    const serialNum =
                      selectedUser.kycData?.documentSerialNumber || '509.281.392';
                    const certFilename =
                      selectedUser.kycData?.criminalRecordDocCode ||
                      `Certificado_Antecedentes_${selectedUser.rut.replace(/\D/g, '')}.pdf`;

                    return (
                      <div className="border border-slate-200 rounded-2xl overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                <th className="py-2.5 px-4">Campo Evaluado</th>
                                <th className="py-2.5 px-4">Datos Declarados en Cuenta</th>
                                <th className="py-2.5 px-4">Datos Extraídos (Cédula / Biometría / PDF)</th>
                                <th className="py-2.5 px-4 text-right">Resultado</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              <tr className="hover:bg-slate-50/60">
                                <td className="py-2.5 px-4 font-semibold text-slate-700">Nombre Titular</td>
                                <td className="py-2.5 px-4 font-bold text-slate-900">{selectedUser.fullName}</td>
                                <td className="py-2.5 px-4 font-mono text-slate-800">{selectedUser.fullName.toUpperCase()}</td>
                                <td className="py-2.5 px-4 text-right">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">
                                    ✓ Coincide
                                  </span>
                                </td>
                              </tr>

                              <tr className="hover:bg-slate-50/60">
                                <td className="py-2.5 px-4 font-semibold text-slate-700">RUN / RUT Chileno</td>
                                <td className="py-2.5 px-4 font-mono font-bold text-slate-900">{registeredRut}</td>
                                <td className="py-2.5 px-4 font-mono font-bold text-indigo-700">{extractedRut}</td>
                                <td className="py-2.5 px-4 text-right">
                                  {rutMatches ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">
                                      ✓ Coincide (Módulo 11)
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700">
                                      ⚠ Discrepancia
                                    </span>
                                  )}
                                </td>
                              </tr>

                              <tr className="hover:bg-slate-50/60">
                                <td className="py-2.5 px-4 font-semibold text-slate-700">N° Serie Documento</td>
                                <td className="py-2.5 px-4 text-slate-500">Registro Civil Chile</td>
                                <td className="py-2.5 px-4 font-mono font-bold text-slate-900">{serialNum}</td>
                                <td className="py-2.5 px-4 text-right">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">
                                    ✓ Cédula Vigente
                                  </span>
                                </td>
                              </tr>

                              <tr className="hover:bg-slate-50/60">
                                <td className="py-2.5 px-4 font-semibold text-slate-700">Reconocimiento Facial</td>
                                <td className="py-2.5 px-4 text-slate-600">Foto del Carnet / Perfil</td>
                                <td className="py-2.5 px-4 font-bold text-slate-900">
                                  {bioScore > 0 ? `${bioScore}% similitud facial (Liveness OK)` : 'Captura pendiente'}
                                </td>
                                <td className="py-2.5 px-4 text-right">
                                  {bioScore >= 85 ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">
                                      ✓ Biométrico Aprobado
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700">
                                      Pendiente
                                    </span>
                                  )}
                                </td>
                              </tr>

                              <tr className="hover:bg-slate-50/60">
                                <td className="py-2.5 px-4 font-semibold text-slate-700">Certificado Antecedentes</td>
                                <td className="py-2.5 px-4 text-slate-600">Fines Especiales (Ley 19.628)</td>
                                <td className="py-2.5 px-4 font-mono text-slate-800 truncate max-w-[200px]">
                                  {certFilename}
                                </td>
                                <td className="py-2.5 px-4 text-right">
                                  {selectedUser.kycData?.criminalRecordSubmitted ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700">
                                      ✓ Sin Anotaciones
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                                      No adjunto
                                    </span>
                                  )}
                                </td>
                              </tr>

                              <tr className="hover:bg-slate-50/60">
                                <td className="py-2.5 px-4 font-semibold text-slate-700">Rol / Residencia</td>
                                <td className="py-2.5 px-4 text-slate-700">
                                  {selectedUser.role === 'owner' || selectedUser.ownerTermsAccepted
                                    ? 'Propietario / Anfitrión'
                                    : 'Arrendatario'}
                                </td>
                                <td className="py-2.5 px-4 text-slate-700">
                                  {selectedUser.commune || 'Providencia'}, {selectedUser.city || 'Santiago'}
                                </td>
                                <td className="py-2.5 px-4 text-right">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700">
                                    Verificado
                                  </span>
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
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <ScanFace className="w-4 h-4 text-indigo-600" />
                      2. Imágenes Capturadas: Cédula de Identidad (Frente y Dorso) y Selfie Biométrica
                    </h4>
                    <span className="text-[11px] text-slate-400">
                      Haz clic en cualquier imagen para ampliarla
                    </span>
                  </div>

                  {(() => {
                    const frontImg =
                      selectedUser.kycData?.idFrontUrl ||
                      getSimulatedCedulaImage(
                        'front',
                        selectedUser.fullName.toUpperCase(),
                        formatRut(selectedUser.rut)
                      );
                    const backImg =
                      selectedUser.kycData?.idBackUrl ||
                      getSimulatedCedulaImage(
                        'back',
                        selectedUser.fullName.toUpperCase(),
                        formatRut(selectedUser.rut)
                      );
                    const faceImg =
                      selectedUser.kycData?.photoUrl ||
                      getSimulatedFaceImage(selectedUser.fullName.toUpperCase());

                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {/* 1. Cédula Frente */}
                        <div className="border border-slate-200 rounded-xl p-3 space-y-2.5 bg-slate-50/50">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                              <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                              Cédula Anverso
                            </span>
                            <button
                              onClick={() =>
                                setPreviewImage({
                                  title: `Cédula Anverso — ${selectedUser.fullName}`,
                                  url: frontImg,
                                })
                              }
                              className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" /> Ampliar
                            </button>
                          </div>
                          <div
                            onClick={() =>
                              setPreviewImage({
                                title: `Cédula Anverso — ${selectedUser.fullName}`,
                                url: frontImg,
                              })
                            }
                            className="aspect-16/10 rounded-lg overflow-hidden bg-slate-900 border border-slate-200 cursor-pointer group relative"
                          >
                            <img
                              src={frontImg}
                              alt="Cédula Anverso"
                              className="w-full h-full object-cover group-hover:scale-105 transition"
                            />
                          </div>
                        </div>

                        {/* 2. Cédula Reverso */}
                        <div className="border border-slate-200 rounded-xl p-3 space-y-2.5 bg-slate-50/50">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5 text-indigo-600" />
                              Cédula Reverso
                            </span>
                            <button
                              onClick={() =>
                                setPreviewImage({
                                  title: `Cédula Reverso — ${selectedUser.fullName}`,
                                  url: backImg,
                                })
                              }
                              className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" /> Ampliar
                            </button>
                          </div>
                          <div
                            onClick={() =>
                              setPreviewImage({
                                title: `Cédula Reverso — ${selectedUser.fullName}`,
                                url: backImg,
                              })
                            }
                            className="aspect-16/10 rounded-lg overflow-hidden bg-slate-900 border border-slate-200 cursor-pointer group relative"
                          >
                            <img
                              src={backImg}
                              alt="Cédula Reverso"
                              className="w-full h-full object-cover group-hover:scale-105 transition"
                            />
                          </div>
                        </div>

                        {/* 3. Selfie Biométrica */}
                        <div className="border border-slate-200 rounded-xl p-3 space-y-2.5 bg-slate-50/50">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                              <ScanFace className="w-3.5 h-3.5 text-emerald-600" />
                              Selfie Biométrica
                            </span>
                            <button
                              onClick={() =>
                                setPreviewImage({
                                  title: `Reconocimiento Facial en Vivo — ${selectedUser.fullName}`,
                                  url: faceImg,
                                })
                              }
                              className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" /> Ampliar
                            </button>
                          </div>
                          <div
                            onClick={() =>
                              setPreviewImage({
                                title: `Reconocimiento Facial en Vivo — ${selectedUser.fullName}`,
                                url: faceImg,
                              })
                            }
                            className="aspect-16/10 rounded-lg overflow-hidden bg-slate-900 border border-slate-200 cursor-pointer group relative"
                          >
                            <img
                              src={faceImg}
                              alt="Selfie Biométrica"
                              className="w-full h-full object-cover group-hover:scale-105 transition"
                            />
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
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <FileCheck2 className="w-4 h-4 text-amber-600" />
                      3. Certificado PDF Enviado (Registro Civil de Chile)
                    </h4>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPreviewPdfCertificateUserId(selectedUser.id)}
                        className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Visualizar Certificado PDF Completo
                      </button>
                      <button
                        onClick={() => downloadCriminalRecordCertificate(selectedUser)}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-slate-500" />
                        Descargar PDF
                      </button>
                    </div>
                  </div>

                  {/* Vista Previa Integrada del Documento PDF del Certificado */}
                  <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 sm:p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center font-extrabold text-xs shrink-0 shadow-2xs">
                          PDF
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-900">
                            {selectedUser.kycData?.criminalRecordDocCode ||
                              `Certificado_Antecedentes_${selectedUser.rut.replace(/\D/g, '')}.pdf`}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Servicio de Registro Civil e Identificación · República de Chile
                          </div>
                        </div>
                      </div>

                      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 self-start sm:self-auto">
                        ✓ Documento PDF Verificado
                      </span>
                    </div>

                    {/* Hoja simulada o archivo subido del Certificado */}
                    <div
                      onClick={() => setPreviewPdfCertificateUserId(selectedUser.id)}
                      className="bg-white border border-slate-300 rounded-xl p-4 sm:p-5 shadow-2xs cursor-pointer hover:border-indigo-400 transition space-y-3"
                    >
                      <div className="flex items-start justify-between border-b-2 border-indigo-900 pb-3">
                        <div>
                          <div className="text-[10px] font-bold text-indigo-900 uppercase tracking-wider">
                            República de Chile · Servicio de Registro Civil e Identificación
                          </div>
                          <div className="text-xs sm:text-sm font-black text-slate-900 mt-0.5">
                            CERTIFICADO DE ANTECEDENTES PARA FINES ESPECIALES
                          </div>
                        </div>
                        <div className="text-right font-mono text-[10px] text-slate-500">
                          <div>FOLIO: 50049281</div>
                          <div>LEY N° 19.628</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold block uppercase">
                            Nombre Titular
                          </span>
                          <span className="font-bold text-slate-900">
                            {selectedUser.fullName.toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold block uppercase">
                            RUN / RUT
                          </span>
                          <span className="font-mono font-bold text-indigo-900">
                            {formatRut(selectedUser.rut)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold block uppercase">
                            Registro General de Condenas
                          </span>
                          <span className="font-extrabold text-emerald-700">
                            SIN ANOTACIONES VIGENTES
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                        <span>Timbre Electrónico Avanzado (Ley 19.799)</span>
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
              <h2 className="text-base font-bold text-slate-900">
                Catálogo y Moderación de Espacios
              </h2>
              <p className="text-xs text-slate-500">
                Activa o pausa inmuebles publicados por propietarios en Chile.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
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
              <div className="p-12 text-center text-xs text-slate-400">
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
                      <img
                        src={sp.images[0]}
                        alt={sp.title}
                        className="w-16 h-14 rounded-xl object-cover shrink-0 bg-slate-100"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-slate-900 truncate">
                            {sp.title}
                          </h3>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              sp.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {sp.status === 'active' ? 'Activo' : 'Pausado'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            {sp.commune}
                          </span>
                          <span>
                            Propietario: <strong className="text-slate-700">{sp.ownerName}</strong> ({formatRut(sp.ownerRut)})
                          </span>
                          <span className="font-bold text-slate-900">
                            {formatClp(rate.amount)} {rate.unitLabel}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <button
                        onClick={() =>
                          adminToggleSpaceStatus(
                            sp.id,
                            sp.status === 'active' ? 'paused' : 'active'
                          )
                        }
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                          sp.status === 'active'
                            ? 'border border-slate-200 text-slate-700 hover:bg-slate-100'
                            : 'bg-emerald-600 text-white hover:bg-emerald-700'
                        }`}
                      >
                        {sp.status === 'active' ? 'Pausar Espacio' : 'Activar Espacio'}
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
              <h2 className="text-base font-bold text-slate-900">
                Centro de Arbitraje y Garantías
              </h2>
              <p className="text-xs text-slate-500">
                Resuelve reclamos entre arrendatarios y propietarios sobre el pago retenido en custodia (Arriendo + Garantía + 5% Comisión).
              </p>
            </div>

            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-start sm:self-auto">
              {[
                { id: 'all', label: 'Todas' },
                { id: 'open', label: 'En Arbitraje' },
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
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Cuando el arrendatario paga, Spotly retiene en custodia: <strong>Valor Hora/Día</strong> + <strong>Garantía de Daños</strong> + <strong>5% Comisión Spotly</strong>.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200/80 space-y-1">
              <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>2. Si reembolsas al Arrendatario</span>
              </div>
              <p className="text-[11px] text-emerald-800 leading-relaxed">
                Por falla del lugar (ej. corte de luz, recinto cerrado), se devuelve el <strong>100% de todo lo pagado</strong> (Arriendo + Garantía + 5% Comisión). Spotly anula su 5%.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-200/80 space-y-1">
              <div className="font-bold text-indigo-900 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>3. Si liberas al Propietario</span>
              </div>
              <p className="text-[11px] text-indigo-800 leading-relaxed">
                Si hubo daños o el reclamo no procede, el propietario recibe el <strong>Arriendo (menos 5% comisión) + la Garantía</strong>, y Spotly retiene su <strong>5% de comisión</strong>.
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {filteredDisputes.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400">
                No hay disputas registradas en este estado.
              </div>
            ) : (
              filteredDisputes.map((d) => {
                const isResolved =
                  d.status === 'resolved_refund' || d.status === 'resolved_owner';
                const linkedRes = reservations.find((r) => r.id === d.reservationId);

                // Cálculo real del desglose (Arriendo Hora/Día + Garantía + 5% Comisión)
                const rentalSubtotal =
                  d.subtotalClp ?? linkedRes?.subtotalClp ?? (d.id === 'disp-001' ? 120000 : Math.round(d.amountClp * 0.65));
                const securityDeposit =
                  d.securityDepositClp ?? linkedRes?.securityDepositClp ?? (d.id === 'disp-001' ? 60000 : Math.round(d.amountClp * 0.3));
                const platformFee5Pct =
                  d.platformFeeClp ?? linkedRes?.platformFeeClp ?? Math.round(rentalSubtotal * 0.05);
                const totalCustody = rentalSubtotal + securityDeposit + platformFee5Pct;
                const ownerNetIfReleased = Math.round(rentalSubtotal * 0.95) + securityDeposit;

                return (
                  <div key={d.id} className="p-4 sm:p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-slate-500">
                          #{d.id}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            isResolved
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {d.status === 'resolved_refund'
                            ? 'Resuelta · Reembolso 100% al Arrendatario'
                            : d.status === 'resolved_owner'
                            ? 'Resuelta · Liberado al Propietario'
                            : 'En Arbitraje'}
                        </span>
                        <h3 className="text-sm font-bold text-slate-900">
                          {d.spaceTitle}
                        </h3>
                      </div>

                      <div className="text-sm font-extrabold text-rose-600 tabular-nums">
                        Total en Custodia: {formatClp(totalCustody)}
                      </div>
                    </div>

                    {/* Desglose Financiero Transparente de la Reserva en Disputa */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3.5 rounded-xl bg-indigo-50/40 border border-indigo-100 text-xs">
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200/80">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">
                          1. Valor Hora / Día
                        </span>
                        <strong className="text-sm font-extrabold text-slate-900 tabular-nums">
                          {formatClp(rentalSubtotal)}
                        </strong>
                        <span className="block text-[10px] text-slate-500 mt-0.5">
                          Tarifa base del espacio
                        </span>
                      </div>

                      <div className="bg-white p-2.5 rounded-lg border border-slate-200/80">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">
                          2. Garantía en Custodia
                        </span>
                        <strong className="text-sm font-extrabold text-slate-900 tabular-nums">
                          {formatClp(securityDeposit)}
                        </strong>
                        <span className="block text-[10px] text-slate-500 mt-0.5">
                          Caución por daños
                        </span>
                      </div>

                      <div className="bg-white p-2.5 rounded-lg border border-slate-200/80">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">
                          3. Comisión Spotly (5%)
                        </span>
                        <strong className="text-sm font-extrabold text-indigo-700 tabular-nums">
                          {formatClp(platformFee5Pct)}
                        </strong>
                        <span className="block text-[10px] text-slate-500 mt-0.5">
                          {d.status === 'resolved_refund' ? 'Devuelta al cliente' : '5% sobre el arriendo'}
                        </span>
                      </div>

                      <div className="bg-white p-2.5 rounded-lg border border-rose-200">
                        <span className="text-[10px] font-bold uppercase text-rose-600 block">
                          Total Pagado (1 + 2 + 3)
                        </span>
                        <strong className="text-sm font-extrabold text-rose-700 tabular-nums">
                          {formatClp(totalCustody)}
                        </strong>
                        <span className="block text-[10px] text-slate-500 mt-0.5">
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
                        <span className="text-slate-400 block">Arrendatario</span>
                        <strong className="text-slate-800">{d.tenantName}</strong>
                        <span className="block text-[11px] text-slate-500 font-mono">
                          RUT {formatRut(d.tenantRut)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Propietario</span>
                        <strong className="text-slate-800">{d.ownerName}</strong>
                        <span className="block text-[11px] text-slate-500 font-mono">
                          RUT {formatRut(d.ownerRut)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Motivo del Reclamo</span>
                        <p className="text-slate-700 mt-0.5 leading-snug">{d.reason}</p>
                      </div>
                    </div>

                    {isResolved ? (
                      <div className="text-xs text-emerald-800 bg-emerald-50/70 border border-emerald-200/80 px-3.5 py-2.5 rounded-xl space-y-1">
                        <div>
                          <strong>Dictamen Final:</strong> {d.resolutionNotes}
                        </div>
                        <div className="text-[11px] text-emerald-900 font-medium">
                          {d.status === 'resolved_refund' ? (
                            <>
                              ✓ <strong>Liquidación ejecutada:</strong> Se reembolsó el 100% al arrendatario ({formatClp(totalCustody)}: {formatClp(rentalSubtotal)} de arriendo + {formatClp(securityDeposit)} de garantía + {formatClp(platformFee5Pct)} del 5% de comisión Spotly).
                            </>
                          ) : (
                            <>
                              ✓ <strong>Liquidación ejecutada:</strong> Se liberó al propietario {formatClp(ownerNetIfReleased)} (95% del arriendo + garantía de {formatClp(securityDeposit)}) y Spotly retuvo su comisión del 5% ({formatClp(platformFee5Pct)}).
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
                                  'Fallo a favor del arrendatario por incumplimiento del recinto. Se reembolsa 100% (Arriendo + Garantía + 5% Comisión).'
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
      {activeTab === 'transactions' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Detalle de Volumen Transaccionado y Comisiones Spotly
              </h2>
              <p className="text-xs text-slate-500">
                Registro consolidado de arriendos confirmados, garantías en custodia y comisión operativa del 5%.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="px-3.5 py-2 rounded-xl bg-indigo-50 border border-indigo-200/70 text-xs">
                <span className="text-indigo-600 font-semibold">Total Transaccionado: </span>
                <strong className="text-indigo-950 font-extrabold tabular-nums">
                  {formatClp(metrics.totalGmvClp)}
                </strong>
              </div>
              <div className="px-3.5 py-2 rounded-xl bg-emerald-50 border border-emerald-200/70 text-xs">
                <span className="text-emerald-700 font-semibold">Comisión Spotly (5%): </span>
                <strong className="text-emerald-950 font-extrabold tabular-nums">
                  {formatClp(metrics.totalPlatformFeeClp)}
                </strong>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-500">
                  <th className="py-3 px-4">Reserva / Fecha</th>
                  <th className="py-3 px-4">Espacio y Anfitrión</th>
                  <th className="py-3 px-4">Arrendatario</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4 text-right">Total Pagado</th>
                  <th className="py-3 px-4 text-right">Comisión Spotly (5%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reservations.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="py-3.5 px-4">
                      <div className="font-mono font-bold text-slate-800">{r.id}</div>
                      <div className="text-[11px] text-slate-500">
                        {r.startDate} {r.endDate !== r.startDate ? `al ${r.endDate}` : ''}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{r.spaceTitle}</div>
                      <div className="text-[11px] text-slate-500">Propietario: {r.ownerName}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-800">{r.tenantName}</div>
                      <div className="text-[11px] text-slate-500 font-mono">RUT {formatRut(r.tenantRut)}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          r.status === 'confirmed' || r.status === 'completed'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : r.status === 'pending'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {r.status === 'confirmed' || r.status === 'completed'
                          ? 'Confirmada'
                          : r.status === 'pending'
                          ? 'Pendiente'
                          : 'Cancelada'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-extrabold text-slate-900 tabular-nums">
                      {formatClp(r.totalClp)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-extrabold text-emerald-700 tabular-nums">
                      {formatClp(r.platformFeeClp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
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
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
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
                <span className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-black text-xs">
                  PDF
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold truncate">
                    {pdfModalUser.kycData?.criminalRecordDocCode ||
                      `Certificado_Antecedentes_${pdfModalUser.rut.replace(/\D/g, '')}.pdf`}
                  </h3>
                  <p className="text-[11px] text-slate-400 truncate">
                    Expediente KYC · {pdfModalUser.fullName} (RUT {formatRut(pdfModalUser.rut)})
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => downloadCriminalRecordCertificate(pdfModalUser)}
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Descargar Certificado
                </button>
                <button
                  onClick={() => setPreviewPdfCertificateUserId(null)}
                  className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Contenido del Certificado PDF */}
            <div className="p-6 sm:p-8 bg-slate-100 max-h-[75vh] overflow-y-auto space-y-6">
              {pdfModalUser.kycData?.criminalRecordUrl &&
              pdfModalUser.kycData.criminalRecordUrl.startsWith('data:image/') ? (
                <div className="bg-white p-4 rounded-2xl border border-slate-300 shadow-sm">
                  <img
                    src={pdfModalUser.kycData.criminalRecordUrl}
                    alt="Certificado subido por el usuario"
                    className="max-w-full mx-auto rounded-lg"
                  />
                </div>
              ) : null}

              {/* Hoja Oficial del Certificado de Antecedentes del Registro Civil */}
              <div className="bg-white border-2 border-indigo-950 rounded-xl p-6 sm:p-10 shadow-md space-y-6 text-slate-800">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b-2 border-indigo-950 pb-5">
                  <div>
                    <div className="text-xs font-bold text-indigo-900 tracking-widest uppercase">
                      República de Chile
                    </div>
                    <div className="text-base sm:text-lg font-black text-slate-900 mt-0.5">
                      SERVICIO DE REGISTRO CIVIL E IDENTIFICACIÓN
                    </div>
                    <div className="text-xs font-semibold text-slate-600 mt-1">
                      CERTIFICADO DE ANTECEDENTES PARA FINES ESPECIALES
                    </div>
                  </div>
                  <div className="font-mono text-xs bg-slate-50 p-3 rounded-lg border border-slate-200 text-right">
                    <div>
                      <strong>FOLIO:</strong> 50049281{pdfModalUser.rut.replace(/\D/g, '').slice(0, 4)}
                    </div>
                    <div>
                      <strong>CÓDIGO VERIFICACIÓN:</strong> RC-{pdfModalUser.rut.replace(/\D/g, '').slice(0, 6)}
                    </div>
                    <div>
                      <strong>FECHA EMISIÓN:</strong>{' '}
                      {new Date(pdfModalUser.kycData?.submittedAt || pdfModalUser.createdAt).toLocaleDateString('es-CL')}
                    </div>
                  </div>
                </div>

                <p className="text-xs sm:text-sm leading-relaxed text-slate-700">
                  El Servicio de Registro Civil e Identificación de Chile certifica que, consultado el Registro General de Condenas conforme a la Ley N° 19.628, la persona individualizada a continuación registra los siguientes datos:
                </p>

                <div className="bg-indigo-50/60 border border-indigo-200 rounded-xl p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 font-bold block uppercase text-[10px]">
                      Nombre Completo
                    </span>
                    <span className="text-sm font-black text-slate-900">
                      {pdfModalUser.fullName.toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-bold block uppercase text-[10px]">
                      RUN / RUT Oficial
                    </span>
                    <span className="text-sm font-mono font-black text-indigo-950">
                      {formatRut(pdfModalUser.rut)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-bold block uppercase text-[10px]">
                      N° Serie Cédula de Identidad
                    </span>
                    <span className="font-mono font-bold text-slate-800">
                      {pdfModalUser.kycData?.documentSerialNumber || '509.281.392'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-bold block uppercase text-[10px]">
                      Estado de Validación en Plataforma
                    </span>
                    <span className="font-bold text-emerald-700">
                      ✓ Cotejado con Cédula y Biometría
                    </span>
                  </div>
                </div>

                <div className="border-2 border-emerald-600 bg-emerald-50/60 rounded-xl p-5 text-center space-y-1">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                    Registro General de Condenas · Informe Oficial
                  </div>
                  <div className="text-base sm:text-lg font-black text-emerald-950 tracking-wide">
                    SIN ANOTACIONES PENALES NI JUDICIALES VIGENTES
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[11px] text-slate-500">
                  <div>
                    <strong>Firma Electrónica Avanzada (Ley N° 19.799)</strong>
                    <br />
                    Timbre Digital Registro Civil de Chile · Documento íntegro y verificable.
                  </div>
                  <div className="font-mono text-indigo-900 font-bold">
                    HASH: SHA256-{pdfModalUser.id.toUpperCase()}-CERT
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
