import { BRANCHES, WINDOWS } from '../config/topology';

const inferRouteBranch = (dest) => {
  const d = (dest || "").toUpperCase();
  if (d.includes("CAMNAGO") || d.includes("LENTATE")) return BRANCHES.BRENNERO;
  if (d.includes("ASSO") || d.includes("MARIANO") || d.includes("ERBA") || d.includes("MERONE")) return BRANCHES.FARGA;
  return BRANCHES.COMMON;
};

export const normalizeTrains = (arrivals, departures) => {
  const trains = new Map();
  const allRaw = [
    ...arrivals.map(t => ({ ...t, type: 'ARR' })),
    ...departures.map(t => ({ ...t, type: 'DEP' }))
  ];

  allRaw.forEach(t => {
    if (t.provvedimento === 1) return;
    const baseTs = t.orarioArrivo || t.orarioPartenza;
    const realTs = new Date(baseTs).getTime() + (Number(t.ritardo || 0) * 60000);
    const dest = (t.destinazione || t.origine || "").toUpperCase();
    const direction = (dest.includes("ASSO") || dest.includes("CAMNAGO") || dest.includes("MARIANO") || dest.includes("MEDA")) ? "NORD" : "SUD";

    if (!trains.has(t.numeroTreno)) {
      trains.set(t.numeroTreno, {
        id: t.numeroTreno,
        cat: t.categoriaDescrizione || t.categoria,
        direction,
        routeBranch: inferRouteBranch(t.destinazione || t.origine),
        dest: t.destinazione || t.origine,
        delay: t.ritardo || 0,
        arrivalTs: null,
        departureTs: null,
        schedTime: t.compOrarioArrivo || t.compOrarioPartenza
      });
    }
    const entry = trains.get(t.numeroTreno);
    if (t.type === 'ARR') entry.arrivalTs = realTs; else entry.departureTs = realTs;
  });

  return Array.from(trains.values());
};

export const isBranchCompatible = (trainBranch, plBranch) => {
  if (plBranch === BRANCHES.CESANO || plBranch === BRANCHES.COMMON) return true;
  return trainBranch === plBranch;
};
