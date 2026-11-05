import LegalPage from "../components/legal-page";

export const metadata = {
  title: "Confidentialité — CRM MKL Énergies",
  description: "Politique de confidentialité détaillée du CRM MKL Énergies, y compris l’utilisation des données Google Calendar.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Règles de confidentialité">
      <p>Dernière mise à jour : 17 septembre 2026. Cette page est publique, sans connexion.</p>

      <h2>1. Responsable du traitement</h2>
      <p>
        Le responsable du traitement est MKL Énergies. Pour toute question relative aux données
        personnelles : <a href="mailto:contact@mkl-energies.fr">contact@mkl-energies.fr</a>.
      </p>
      <p>
        L’application concernée est le CRM interne MKL Énergies, accessible aux collaborateurs
        autorisés. Une présentation publique de l’application se trouve sur la
        {" "}<a href="/a-propos">page d’accueil / à propos</a>.
      </p>

      <h2>2. Champ d’application</h2>
      <p>
        Cette politique décrit quelles données sont collectées, pourquoi, comment elles sont
        utilisées, combien de temps elles sont conservées, avec qui elles peuvent être partagées,
        et quels droits ont les personnes concernées. Elle couvre à la fois les données métier
        saisies dans le CRM et les données Google auxquelles un utilisateur donne accès s’il
        connecte Google Calendar.
      </p>

      <h2>3. Données collectées dans le CRM</h2>
      <p>Lorsque l’équipe utilise le CRM, nous traitons notamment :</p>
      <ul>
        <li>identité et coordonnées des collaborateurs (nom, e-mail, rôle, PIN haché, statut du compte) ;</li>
        <li>données prospects et clients (nom, téléphone, e-mail, adresse, type de projet, notes, valeur estimée) ;</li>
        <li>données commerciales (devis, factures, articles, rendez-vous, rappels, historique) ;</li>
        <li>données techniques liées au métier (études, visites, contrats de maintenance), lorsqu’elles sont saisies.</li>
      </ul>
      <p>
        Ces informations sont fournies par les utilisateurs du CRM dans le cadre de leur travail.
        Elles ne sont pas collectées auprès du grand public via l’application.
      </p>

      <h2>4. Données Google Calendar</h2>
      <p>
        Un utilisateur peut relier son compte Google afin de synchroniser son agenda. Cette
        connexion est facultative. Elle passe par OAuth Google : l’utilisateur voit l’écran
        d’autorisation Google et peut refuser. Le CRM ne demande jamais et ne stocke jamais le
        mot de passe Google.
      </p>
      <p>Si l’utilisateur accepte, le CRM peut accéder à :</p>
      <ul>
        <li>l’adresse e-mail du compte Google autorisé, pour identifier le compte connecté ;</li>
        <li>la liste des agendas Google, pour lui permettre d’en choisir un ;</li>
        <li>les événements de l’agenda choisi (titre, date et heure de début et de fin, durée, description, lieu, identifiant d’événement), afin de les afficher dans l’agenda commercial et d’éviter les chevauchements ;</li>
        <li>la création ou la mise à jour d’événements Google correspondant aux rendez-vous créés ou modifiés dans le CRM, uniquement pour ce compte.</li>
      </ul>
      <p>Le CRM ne demande pas l’accès à Gmail, Google Drive, Photos, Contacts, ni aux autres services Google non liés à l’agenda.</p>
      <p>
        Les jetons d’accès et de rafraîchissement OAuth sont chiffrés avant stockage. Ils servent
        uniquement à maintenir la synchronisation tant que le compte reste connecté.
      </p>

      <h2>5. Finalités d’utilisation</h2>
      <p>Nous utilisons les données uniquement pour :</p>
      <ul>
        <li>faire fonctionner le CRM interne (suivi commercial, devis, planning, dossiers) ;</li>
        <li>authentifier les collaborateurs (e-mail et PIN) ;</li>
        <li>afficher et synchroniser l’agenda commercial avec Google Calendar, si l’utilisateur l’a autorisé ;</li>
        <li>envoyer des e-mails opérationnels (invitation, PIN, documents), via notre messagerie professionnelle ;</li>
        <li>assurer la sécurité, le support interne et la continuité de service.</li>
      </ul>
      <p>
        Nous n’utilisons pas les données Google pour de la publicité, du reciblage, de la revente,
        de l’entraînement de modèles d’intelligence artificielle, ni pour un usage indépendant de
        la synchronisation d’agenda demandée par l’utilisateur.
      </p>

      <h2>6. Politique Google Limited Use</h2>
      <p>
        L’utilisation des informations reçues des API Google est conforme à la
        {" "}<a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>,
        y compris les exigences Limited Use. Les données Google Calendar ne sont transférées qu’aux
        sous-traitants techniques nécessaires à l’hébergement du CRM, et uniquement pour fournir
        la fonctionnalité d’agenda. Elles ne sont pas vendues. Elles ne sont pas utilisées pour
        déterminer la solvabilité ni à des fins publicitaires.
      </p>

      <h2>7. Base légale</h2>
      <p>
        Le traitement des données collaborateurs et dossiers métier repose sur l’intérêt légitime
        de MKL Énergies à organiser son activité commerciale, et sur l’exécution des mesures
        nécessaires à la relation client lorsque des données de prospects ou clients sont saisies.
        L’accès à Google Calendar repose sur le consentement de l’utilisateur, retirable à tout
        moment en déconnectant Google dans le CRM ou via son compte Google.
      </p>

      <h2>8. Conservation</h2>
      <p>
        Les données métier sont conservées pendant la durée d’utilisation du CRM et des obligations
        légales ou commerciales applicables, puis archivées ou supprimées. Les jetons Google et les
        événements importés liés à Google sont conservés tant que la synchronisation est active.
        Lors de la déconnexion Google, l’autorisation est révoquée côté CRM ; l’utilisateur peut
        aussi retirer l’accès dans les paramètres de son compte Google.
      </p>

      <h2>9. Destinataires et sous-traitants</h2>
      <p>
        Les données sont accessibles aux collaborateurs MKL Énergies selon leurs droits dans le CRM.
        Elles sont hébergées chez nos prestataires techniques (hébergement de l’application et base
        de données). Elles ne sont pas cédées à des partenaires marketing. Google reçoit les
        événements que le CRM envoie vers Calendar, uniquement si l’utilisateur a connecté son
        compte.
      </p>

      <h2>10. Transferts et sécurité</h2>
      <p>
        Les échanges se font en HTTPS. Les secrets et jetons OAuth sont chiffrés. L’accès au CRM
        exige une authentification. Malgré ces mesures, aucun système n’est exempt de risque ; en
        cas d’incident, MKL Énergies prendra les mesures raisonnables d’information et de
        confinement.
      </p>

      <h2>11. Cookies et session</h2>
      <p>
        Le CRM utilise un stockage de session technique pour maintenir la connexion du
        collaborateur (jeton d’accès). Il n’utilise pas de cookies publicitaires ni de traceurs
        de mesure d’audience tiers sur les pages légales publiques.
      </p>

      <h2>12. Droits des personnes</h2>
      <p>
        Selon la réglementation applicable, vous pouvez demander l’accès, la rectification, la
        suppression, la limitation, ou vous opposer à certains traitements, et retirer votre
        consentement Google. Pour exercer ces droits :
        {" "}<a href="mailto:contact@mkl-energies.fr">contact@mkl-energies.fr</a>.
        Un utilisateur du CRM peut aussi déconnecter Google Calendar depuis l’application.
      </p>

      <h2>13. Mineurs</h2>
      <p>Le CRM n’est pas destiné aux mineurs et n’est pas offert au public.</p>

      <h2>14. Modifications</h2>
      <p>
        Cette politique peut être mise à jour pour refléter un changement de l’application ou de
        la loi. La date en tête de page fait foi. Les utilisateurs du CRM en sont informés en cas
        de changement substantiel portant sur Google Calendar.
      </p>
    </LegalPage>
  );
}
