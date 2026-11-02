import React from 'react';
import { MapPin, ExternalLink } from 'lucide-react';

interface SpaceLocationMapProps {
  address: string;
  commune: string;
  region: string;
  landmark?: string;
}

// Mapa real (Google Maps). Antes de reservar se muestra solo la comuna: la
// dirección exacta se entrega a quien tiene una reserva confirmada.
export const SpaceLocationMap: React.FC<SpaceLocationMapProps> = ({ address, commune, region, landmark }) => {
  const place = [address, commune, region, 'Chile'].filter(Boolean).join(', ');
  const query = encodeURIComponent(place);
  const zoom = address ? 16 : 13;
  const embedUrl = `https://www.google.com/maps?q=${query}&z=${zoom}&output=embed&hl=es`;
  const openUrl = `https://www.google.com/maps/search/?api=1&query=${query}`;

  return (
    <section aria-labelledby="space-location-title" className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5 sm:p-6">
        <div className="min-w-0">
          <h2 id="space-location-title" className="flex items-center gap-2 text-base font-bold text-slate-900">
            <MapPin className="h-5 w-5 text-rose-600" aria-hidden="true" />
            Ubicación
          </h2>
          <p className="mt-1 text-sm text-slate-700">
            {address ? (
              <>
                {address}, {commune}, {region}
                {landmark ? ` · cerca de ${landmark}` : ''}
              </>
            ) : (
              <>
                {commune}, {region}. La dirección exacta te llega al confirmar la reserva.
              </>
            )}
          </p>
        </div>
        <a
          href={openUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
        >
          Abrir en Google Maps
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </div>
      <iframe
        title={`Mapa de ${address ? place : `${commune}, ${region}`}`}
        src={embedUrl}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="block h-72 w-full border-0 bg-slate-100 sm:h-80"
      />
    </section>
  );
};
