/**
 * Tutte le soglie temporali del progetto in un unico posto.
 * Prima erano sparse fra componenti, engine e utility con valori incoerenti
 * (30s, 60s, 240s, 300s, 95s, 45000ms, 120000ms...): un treno poteva risultare
 * "in arrivo" in una schermata e "programmato" in un'altra.
 *
 * Convenzione: i valori `*Sec` sono secondi, i valori `*Ms` millisecondi.
 */
export const WINDOWS = Object.freeze({
  /** Sotto questa soglia il PL entra in PREALLERTA. */
  imminentThresholdSec: 180,

  /** Validita' dei dati: oltre STALE_SOFT la stima e' resa "incerta". */
  staleSoftMs: 45_000,
  /** Oltre STALE_HARD i dati vengono considerati non utilizzabili. */
  staleHardMs: 150_000,

  /** Due chiusure piu' vicine di questo intervallo vengono fuse in una sola. */
  mergeGapMs: 25_000,

  /** Indicatore "live" in header. */
  liveIndicatorMs: 95_000,

  /** Oltre questo valore la stima non viene mostrata come certo. */
  maxUncertaintySec: 60,

  /** Soglie per il countdown. */
  countdown: {
    /** Entro ±N secondi dall'istante stimato si mostra "ORA". */
    nowWindowSec: 30,
    /** Oltre N secondi dall'istante stimato l'evento e' "PASSATO". */
    pastAfterSec: 30,
  },

  /** Soglie per l'etichetta di stato del treno. */
  realtime: {
    imminentSec: 60,
    incomingSec: 300,
  },

  /** Lista treni: da quanto tempo in la' un treno si considera "transitato". */
  trainList: {
    keepPastMs: 5 * 60_000,
    /**
     * Orizzonte della lista treni. In modalita' live i dati coprono gia' ~2 ore,
     * ma in orario teorico il file contiene l'intera giornata: senza limite la
     * lista mostrerebbe decine di treni.
     */
    horizonMs: 2 * 60 * 60_000,
  },
});
