import LegalPage from "../components/legal-page";

export const metadata = {
  title: "Conditions d’utilisation — CRM MKL Énergies",
  description: "Conditions d’utilisation du CRM interne MKL Énergies.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Conditions d’utilisation">
      <p>Dernière mise à jour : 17 septembre 2026. Cette page est publique, sans connexion.</p>
      <h2>Objet</h2>
      <p>
        Le CRM MKL Énergies est un outil interne réservé aux collaborateurs autorisés de
        MKL Énergies. Il sert au suivi commercial, aux devis, au planning et à l’agenda.
      </p>
      <h2>Accès</h2>
      <p>
        L’espace de travail s’ouvre avec l’e-mail professionnel et un code PIN personnel.
        Un lien reçu par e-mail ne suffit pas à ouvrir le CRM. MKL Énergies peut créer,
        modifier ou retirer un compte, notamment en cas de départ ou d’usage non conforme.
      </p>
      <h2>Google Calendar</h2>
      <p>
        La synchronisation d’agenda est optionnelle. Elle n’est activée qu’après
        autorisation explicite sur l’écran Google. L’utilisateur reste responsable du
        compte Google qu’il connecte. Les règles de traitement des données sont décrites
        dans les <a href="/confidentialite">règles de confidentialité</a>.
      </p>
      <h2>Responsabilité</h2>
      <p>
        Chaque utilisateur s’engage à saisir des informations exactes, à ne pas partager
        son PIN, et à n’utiliser le CRM que pour l’activité de MKL Énergies.
      </p>
      <p>
        Contact : <a href="mailto:contact@mkl-energies.fr">contact@mkl-energies.fr</a>
      </p>
    </LegalPage>
  );
}
