import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext.tsx';
import { getSpaceOccupancyFromDb, OccupancySlot } from '../lib/dataAccess.ts';
import { Reservation, Space } from '../types.ts';
import { subscribeToChanges, createKeyedDebouncer, onVisibleAgain } from '../lib/realtime.ts';

const slotKey = (r: { startDate: string; endDate: string; hourStart?: number; hourEnd?: number }) =>
  `${r.startDate}|${r.endDate}|${r.hourStart ?? ''}|${r.hourEnd ?? ''}`;

// Reservas activas de un espacio para el calendario (RF-14).
// Combina las reservas que el usuario puede ver completas (propias, o todas si es
// el propietario) con la ocupación pública del espacio, que no expone datos
// personales de otros arrendatarios.
export function useSpaceReservations(space: Pick<Space, 'id' | 'title' | 'ownerId' | 'ownerName' | 'category'>): Reservation[] {
  const { reservations } = useApp();
  const [occupancy, setOccupancy] = useState<OccupancySlot[]>([]);

  const visible = useMemo(
    () => reservations.filter((r) => r.spaceId === space.id && r.status !== 'rejected' && r.status !== 'cancelled'),
    [reservations, space.id]
  );

  useEffect(() => {
    let active = true;
    const load = () =>
      getSpaceOccupancyFromDb(space.id).then((slots) => {
        if (active) setOccupancy(slots);
      });
    load();
    // En vez de consultar cada 30 s, se recarga solo cuando la base avisa que
    // cambió una reserva de este espacio (o al volver a la pestaña / reconectar).
    const debouncer = createKeyedDebouncer(400);
    const reload = () => debouncer.run('occupancy', load);
    const stopChannel = subscribeToChanges(`space:${space.id}`, reload, reload);
    const stopVisibility = onVisibleAgain(reload);
    return () => {
      active = false;
      debouncer.cancelAll();
      stopChannel();
      stopVisibility();
    };
  }, [space.id, visible.length]);

  return useMemo(() => {
    const known = new Set(visible.map(slotKey));
    const others: Reservation[] = occupancy
      .filter((slot) => !known.has(slotKey(slot)))
      .map((slot, index) => ({
        id: `occupied-${space.id}-${index}`,
        spaceId: space.id,
        spaceTitle: space.title,
        spaceAddress: '',
        spaceImage: '',
        spaceCategory: space.category,
        tenantId: '',
        tenantName: 'Reservado',
        tenantEmail: '',
        tenantRut: '',
        ownerId: space.ownerId,
        ownerName: space.ownerName,
        startDate: slot.startDate,
        endDate: slot.endDate,
        totalDays: slot.totalDays,
        dailyRateClp: 0,
        rentalModality: slot.rentalModality,
        durationUnits: slot.durationUnits,
        hourStart: slot.hourStart,
        hourEnd: slot.hourEnd,
        subtotalClp: 0,
        platformFeeClp: 0,
        securityDepositClp: 0,
        totalClp: 0,
        intendedUse: 'Horario reservado',
        status: slot.status,
        createdAt: '',
      }));
    return [...visible, ...others];
  }, [visible, occupancy, space.id, space.title, space.ownerId, space.ownerName, space.category]);
}
