import LegalPage from "../components/legal-page";

export const metadata = {
  title: "À propos — CRM MKL Énergies",
  description: "CRM interne de MKL Énergies : suivi commercial, devis, agenda des rendez-vous et synchronisation Google Calendar.",
};

export default function AboutPage() {
  return (
    <LegalPage title="À propos du CRM MKL Énergies">
      <p>
        Cette page est publique : aucune connexion n’est demandée pour la lire. Elle décrit
        l’objectif de l’application CRM MKL Énergies, destinée aux collaborateurs de l’entreprise.
      </p>
      <h2>Objectif de l’application</h2>
      <p>
        CRM MKL Énergies est le logiciel interne de l’entreprise MKL Énergies, spécialisée dans
        les solutions énergétiques (photovoltaïque, pompes à chaleur, climatisation, entretien).
        L’application sert à piloter l’activité commerciale et opérationnelle au quotidien.
      </p>
      <p>Elle permet à l’équipe de :</p>
      <ul>
        <li>suivre les prospects et les clients ;</li>
        <li>établir et envoyer des devis ;</li>
        <li>planifier les rendez-vous, rappels et visites commerciales ;</li>
        <li>préparer les études thermiques et les dossiers techniques ;</li>
        <li>organiser le planning des chantiers et des contrats de maintenance.</li>
      </ul>
      <h2>Agenda et Google Calendar</h2>
      <p>
        L’agenda commercial du CRM recense les rendez-vous et rappels liés aux prospects.
        Un collaborateur peut, s’il le souhaite, connecter son propre compte Google Calendar.
        L’objectif est d’afficher dans le CRM les événements de l’agenda Google choisi, et
        d’y envoyer les rendez-vous créés dans le CRM, afin d’éviter les doubles saisies et
        les créneaux en conflit.
      </p>
      <p>
        La connexion utilise uniquement l’autorisation officielle Google (OAuth). Le CRM ne
        demande jamais le mot de passe Google. L’utilisateur peut déconnecter son compte à
        tout moment.
      </p>
      <h2>Accès</h2>
      <p>
        L’espace de travail (dossiers clients, devis, agenda) est réservé aux utilisateurs
        autorisés, via e-mail et code PIN. Les informations légales restent publiques :
      </p>
      <ul>
        <li><a href="/confidentialite">Règles de confidentialité</a></li>
        <li><a href="/cgu">Conditions d’utilisation</a></li>
      </ul>
      <p>
        Contact : <a href="mailto:contact@mkl-energies.fr">contact@mkl-energies.fr</a>
      </p>
    </LegalPage>
  );
}
