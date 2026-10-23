import React from 'react';
import { MessageSquare, X } from 'lucide-react';

export interface ContactTenant {
  name: string;
  email: string;
  phone: string;
  spaceTitle: string;
}

// wa.me exige el número con código de país; los móviles chilenos se guardan a veces sin el 56.
export const toWhatsAppNumber = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 9 && digits.startsWith('9') ? `56${digits}` : digits;
};

interface ContactTenantModalProps {
  tenant: ContactTenant;
  onClose: () => void;
}

export const ContactTenantModal: React.FC<ContactTenantModalProps> = ({ tenant, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
    <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-100">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Contactar al arrendatario</h3>
            <p className="text-[11px] text-slate-500">Recinto: {tenant.spaceTitle}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-3 text-xs">
        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
          <div className="font-bold text-slate-900">{tenant.name}</div>
          <div className="text-slate-600">Correo: {tenant.email || 'Sin correo'}</div>
          <div className="text-slate-600">Teléfono: {tenant.phone || 'Sin teléfono'}</div>
        </div>

        <p className="text-slate-500 leading-relaxed">
          Escríbele para coordinar el acceso, el equipamiento o los documentos que necesites.
        </p>

        <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
          {tenant.phone.replace(/\D/g, '').length >= 8 ? (
            <a
              href={`https://wa.me/${toWhatsAppNumber(tenant.phone)}?text=${encodeURIComponent(`Hola ${tenant.name}, te escribo por tu reserva en ${tenant.spaceTitle}.`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center justify-center gap-2 transition"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Abrir WhatsApp</span>
            </a>
          ) : tenant.email ? (
            <a
              href={`mailto:${tenant.email}?subject=${encodeURIComponent(`Reserva en ${tenant.spaceTitle}`)}`}
              className="flex-1 py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold flex items-center justify-center gap-2 transition"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Enviar correo</span>
            </a>
          ) : (
            <p className="flex-1 text-slate-500">El arrendatario no registró teléfono ni correo.</p>
          )}
          <button
            onClick={onClose}
            className="py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  </div>

);
