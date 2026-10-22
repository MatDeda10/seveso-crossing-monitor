/**
 * Avviso di sicurezza permanente.
 * L'app mostra un semaforo per un passaggio a livello reale: chi la usa deve
 * sapere senza ambiguita' che la stima non e' un dispositivo di sicurezza.
 */
const Disclaimer = () => (
  <aside className="disclaimer" role="note">
    <span className="disclaimer-icon" aria-hidden="true">
      !
    </span>

    <div className="disclaimer-body">
      <p>
        <strong>Stima non ufficiale.</strong> Non è un dispositivo di sicurezza e non sostituisce
        barriere, segnaletica e codice della strada.
      </p>

      <details className="disclaimer-details">
        <summary>Dettagli</summary>
        <p>
          Le previsioni derivano dagli orari e dai ritardi pubblicati da Viaggiatreno, combinati con
          tempi di chiusura medi dei passaggi a livello di Seveso. Un guasto, un treno merci, una
          manovra o un errore dei dati possono rendere la stima sbagliata. In caso di dubbio fermati
          e rispetta la segnaletica sul posto.
        </p>
      </details>
    </div>
  </aside>
);

export default Disclaimer;
