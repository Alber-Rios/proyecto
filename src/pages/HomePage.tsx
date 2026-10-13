import React, { lazy, Suspense, useState, useMemo } from 'react';
import { Space, DigitalContract } from '../types.ts';
import { useApp } from '../context/AppContext.tsx';
import { SpaceCard } from '../components/SpaceCard.tsx';
import { SpaceFilters } from '../components/SpaceFilters.tsx';
const BookingModal = lazy(() => import('../components/BookingModal.tsx').then((m) => ({ default: m.BookingModal })));
const ContractModal = lazy(() => import('../components/ContractModal.tsx').then((m) => ({ default: m.ContractModal })));

import {
  Building,
  ArrowRight,
  Compass,
  Search,
  CalendarCheck2,
  ListPlus,
} from 'lucide-react';

interface HomePageProps {
  onOpenOwnerUpgrade: () => void;
  onNavigate: (view: string) => void;
  onOpenAuth?: (mode: 'login' | 'register', notice?: string) => void;
  onSelectSpace?: (space: Space) => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  onOpenOwnerUpgrade,
  onNavigate,
  onOpenAuth,
  onSelectSpace,
}) => {
  const { spaces, currentUser } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedEnvironment, setSelectedEnvironment] = useState<'all' | 'abierto' | 'cerrado'>('all');
  const [selectedRateModality, setSelectedRateModality] = useState<'all' | 'hour' | 'day' | 'month'>('all');
  const [selectedCommune, setSelectedCommune] = useState('Todas las comunas');
  const [minSurfaceM2, setMinSurfaceM2] = useState(10);

  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null);
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [createdContract, setCreatedContract] = useState<DigitalContract | null>(null);
  const [isContractOpen, setIsContractOpen] = useState(false);

  // Filtro de espacios
  const filteredSpaces = useMemo(() => {
    return spaces.filter((space) => {
      // Solo mostrar espacios activos en el catálogo público
      if (space.status !== 'active') return false;

      // Filtro por término de búsqueda
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesTitle = space.title.toLowerCase().includes(term);
        const matchesAddress = space.address.toLowerCase().includes(term);
        const matchesCommune = space.commune.toLowerCase().includes(term);
        const matchesAmenities = space.amenities.some((a) => a.toLowerCase().includes(term));
        if (!matchesTitle && !matchesAddress && !matchesCommune && !matchesAmenities) {
          return false;
        }
      }

      // Filtro por categoría
      if (selectedCategory !== 'all' && space.category !== selectedCategory) {
        return false;
      }

      // Filtro por entorno: abierto vs cerrado
      if (selectedEnvironment !== 'all' && space.spaceEnvironment !== selectedEnvironment) {
        return false;
      }

      // Filtro por comuna
      if (selectedCommune !== 'Todas las comunas' && space.commune !== selectedCommune) {
        return false;
      }

      // Filtro por modalidad de arriendo (Por Hora, Por Día, Por Mes)
      const spaceRateUnit = space.priceUnit || (space.rentalModality === 'por_hora' ? 'hour' : space.rentalModality === 'mensual' ? 'month' : 'day');
      if (selectedRateModality !== 'all' && spaceRateUnit !== selectedRateModality) {
        return false;
      }

      // Filtro por m2
      if (space.surfaceM2 < minSurfaceM2) {
        return false;
      }

      return true;
    });
  }, [spaces, searchTerm, selectedCategory, selectedEnvironment, selectedRateModality, selectedCommune, minSurfaceM2]);

  const handleSelectSpace = (space: Space) => {
    setSelectedSpace(space);
    if (onSelectSpace) {
      onSelectSpace(space);
    } else {
      setIsBookingOpen(true);
    }
  };

  const handleBookingSuccess = (contract: DigitalContract) => {
    setCreatedContract(contract);
    setIsContractOpen(true);
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedCategory('all');
    setSelectedEnvironment('all');
    setSelectedRateModality('all');
    setSelectedCommune('Todas las comunas');
    setMinSurfaceM2(10);
  };

  const activeSpaces = spaces.filter((space) => space.status === 'active');

  const handlePublishSpace = () => {
    if (!currentUser) {
      onOpenAuth?.('register', 'Crea tu cuenta para publicar y administrar un espacio.');
    } else if (currentUser.role === 'owner' || currentUser.ownerTermsAccepted) {
      onNavigate('owner');
    } else {
      onOpenOwnerUpgrade();
    }
  };

  const scrollToListings = () => {
    document.getElementById('espacios')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="space-y-10 pb-16">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-3xl bg-stone-900 text-white px-6 py-12 sm:px-12 sm:py-16">
        <div className="relative z-10 max-w-3xl space-y-5">
          <h1 className="font-display text-4xl sm:text-6xl leading-[1.05] tracking-tight">
            Un lugar para trabajar, crear o reunirte. <em className="text-rose-300">Por hora, día o mes.</em>
          </h1>
          <p className="text-stone-300 text-sm sm:text-base leading-relaxed max-w-2xl">
            Explora espacios disponibles y revisa sus precios, ubicación, equipamiento y modalidades antes de solicitar una reserva.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <button
              type="button"
              onClick={scrollToListings}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-rose-700"
            >
              <Search className="h-4 w-4" /> Buscar espacios
            </button>
            <button
              type="button"
              onClick={handlePublishSpace}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/25 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              <Building className="h-4 w-4" /> Publicar un espacio
            </button>
          </div>
        </div>
      </section>

      {/* Barra de Filtros */}
      <section id="espacios" className="scroll-mt-24 space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="font-display text-3xl tracking-tight text-slate-900">Espacios disponibles</h2>
          <p className="text-sm text-slate-500">Filtra por ubicación, tipo y modalidad de arriendo.</p>
        </div>
        <SpaceFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          selectedEnvironment={selectedEnvironment}
          onEnvironmentChange={setSelectedEnvironment}
          selectedRateModality={selectedRateModality}
          onRateModalityChange={setSelectedRateModality}
          selectedCommune={selectedCommune}
          onCommuneChange={setSelectedCommune}
          minSurfaceM2={minSurfaceM2}
          onMinSurfaceChange={setMinSurfaceM2}
          onReset={handleResetFilters}
        />
      </section>

      {/* Conteo de Resultados */}
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-semibold text-slate-500">
          <span className="text-slate-900 font-bold">{filteredSpaces.length}</span> {filteredSpaces.length === 1 ? 'resultado' : 'resultados'}
        </p>
      </div>

      {/* Grid de Espacios */}
      {activeSpaces.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-10 sm:p-14 text-center space-y-3 shadow-2xs">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 mx-auto flex items-center justify-center">
            <Building className="w-6 h-6" />
          </div>
          <h3 className="text-base sm:text-lg font-bold text-slate-900">
            Aún no hay espacios publicados en el catálogo
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
            Cuando haya espacios publicados y disponibles, aparecerán aquí con sus características y condiciones.
          </p>
          <div className="pt-2">
            <button
              onClick={handlePublishSpace}
              className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition cursor-pointer inline-flex items-center gap-2 shadow-xs"
            >
              <span>Publicar un espacio</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : filteredSpaces.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 mx-auto flex items-center justify-center text-slate-400">
            <Compass className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800">No encontramos espacios con esos filtros</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Prueba con otra comuna, otra modalidad o una superficie menor, o limpia la búsqueda.
          </p>
          <button
            onClick={handleResetFilters}
            className="mt-2 px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 transition"
          >
            Limpiar filtros
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSpaces.map((space) => (
            <SpaceCard key={space.id} space={space} onSelect={handleSelectSpace} />
          ))}
        </div>
      )}

      <section id="como-funciona" className="scroll-mt-24 space-y-5 pt-4">
        <div className="max-w-2xl space-y-2">
          <h2 className="font-display text-3xl sm:text-4xl tracking-tight text-slate-900">¿Cómo funciona Spotly?</h2>
          <p className="text-sm leading-relaxed text-slate-600">Elige si vienes a encontrar un espacio o a publicar uno. Cada paso queda visible desde tu cuenta.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <Search className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Quiero arrendar</h3>
            <ol className="mt-4 space-y-3 text-sm text-slate-600">
              <li className="flex gap-3"><span className="font-bold text-rose-600">01</span><span>Busca por comuna, categoría y modalidad.</span></li>
              <li className="flex gap-3"><span className="font-bold text-rose-600">02</span><span>Revisa disponibilidad, precios y condiciones del espacio.</span></li>
              <li className="flex gap-3"><span className="font-bold text-rose-600">03</span><span>Envía tu solicitud y consulta su estado en Mis reservas.</span></li>
            </ol>
            <button type="button" onClick={scrollToListings} className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-rose-700 hover:text-rose-800">
              Explorar espacios <ArrowRight className="h-4 w-4" />
            </button>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <ListPlus className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Quiero publicar</h3>
            <ol className="mt-4 space-y-3 text-sm text-slate-600">
              <li className="flex gap-3"><span className="font-bold text-slate-700">01</span><span>Crea tu cuenta e inicia la publicación.</span></li>
              <li className="flex gap-3"><span className="font-bold text-slate-700">02</span><span>Agrega información, precios, fotos y disponibilidad reales.</span></li>
              <li className="flex gap-3"><span className="font-bold text-slate-700">03</span><span>Administra tu espacio y las solicitudes desde tu panel.</span></li>
            </ol>
            <button type="button" onClick={handlePublishSpace} className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-slate-800 hover:text-rose-700">
              Publicar un espacio <ArrowRight className="h-4 w-4" />
            </button>
          </article>
        </div>
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-950">
          <CalendarCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <p>Antes de reservar, revisa las condiciones indicadas en cada publicación. La disponibilidad y los detalles pueden variar según el espacio.</p>
        </div>
      </section>

      <Suspense fallback={null}>
        {isBookingOpen && (
          <BookingModal
            space={selectedSpace}
            isOpen={isBookingOpen}
            onClose={() => setIsBookingOpen(false)}
            onSuccess={handleBookingSuccess}
            onOpenAuth={onOpenAuth}
          />
        )}
        {isContractOpen && (
          <ContractModal
            contract={createdContract}
            isOpen={isContractOpen}
            onClose={() => setIsContractOpen(false)}
          />
        )}
      </Suspense>
    </div>
  );
};
