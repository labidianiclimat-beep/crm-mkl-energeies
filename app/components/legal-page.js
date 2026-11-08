export default function LegalPage({ title, children }) {
  return (
    <main className="legal-page">
      <article className="legal-card">
        <header>
          <img src="/mkl-energies.png" alt="MKL Énergies" />
          <p>CRM MKL Énergies</p>
          <h1>{title}</h1>
        </header>
        <div className="legal-body">{children}</div>
        <nav>
          <a href="/a-propos">À propos</a>
          <a href="/confidentialite">Confidentialité</a>
          <a href="/cgu">Conditions d’utilisation</a>
        </nav>
      </article>
    </main>
  );
}
