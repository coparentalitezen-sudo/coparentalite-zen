# 07 — Notifications et e-mails

Étape 7 du mode opératoire. Le moteur est générique ; seuls les **types
d'événement** sont métier — et ce sont des lignes de données, pas du code.

---

## 1. Le principe fondateur

**Une notification est un fait. Le canal par lequel elle atteint la personne
est une question distincte.**

Cette séparation, décidée tôt sur Coparentalité Zen, a permis d'activer le
canal Push puis le canal e-mail **sans rien reprendre** : les tables
existaient déjà et les préférences acceptaient les trois canaux.

## 2. Modèle de données du socle

```
notification_types          (code, libelle, categorie, canaux_par_defaut)
notification_channels       ('internal' | 'email' | 'push')
notifications               (id, destinataire, type, titre, corps, lien,
                             entite, entite_id, scheduled_at, lu_at,
                             created_at)
notification_preferences    (profile_id, type, canal, actif)
notification_deliveries     (notification_id, canal, envoye_at, erreur)
push_subscriptions          (profile_id, endpoint, p256dh, auth, appareil)
reminder_settings           (profile_id, delai_minutes)
```

Ce qui est **métier** : le contenu de `notification_types`. Ajouter un type
est un `insert`, jamais une migration de structure.

## 3. Les cinq règles à ne pas enfreindre

**1. Personne n'est notifié de sa propre action.** La fonction d'émission
écarte l'auteur. Sans cette règle, chaque geste produit une alerte à
soi-même — le meilleur moyen de faire couper les notifications.

**2. Une notification est privée.** La policy la réserve à son destinataire :
elle révèle ce qu'il consulte et quand.

**3. L'idempotence est la propriété critique.** Une tâche planifiée repasse
chaque nuit sur les mêmes événements. Un index unique
`(destinataire, type, entite_id)` rend l'opération rejouable. Sans lui, un
rendez-vous produit un rappel par nuit jusqu'à sa date.

Corollaires : un événement déplacé **met à jour** l'heure et réactive le
rappel même s'il avait été lu ; un événement supprimé voit son rappel purgé.

**4. Un rappel porte une date de pertinence.** `scheduled_at` : il n'apparaît
ni dans la liste ni dans le décompte avant son heure.

**5. Émettre par déclencheur plutôt que par réécriture.** Les faits sont émis
par des triggers qui **observent les changements**, pas en modifiant les
fonctions métier existantes. Deux avantages vérifiés : on ne touche pas à des
fonctions éprouvées (une réécriture large a déjà fait disparaître du code sur
ce projet), et la notification part quelle que soit la voie d'écriture.

⚠ **Dans un déclencheur, l'auteur se lit dans la ligne** (`created_by`), pas
via `auth.uid()` — qui ne reflète pas toujours la session lorsqu'il est appelé
depuis une fonction `SECURITY DEFINER`.

## 4. Canal « application »

Toujours actif, aucune configuration. Cloche + décompte des non-lues + centre
de notifications. C'est le canal de repli quand tout le reste échoue.

## 5. Canal Push

### Mise en place

```bash
npx web-push generate-vapid-keys
```

→ `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTACT`.

⚠ **Générer une seule fois et conserver.** Changer la paire VAPID invalide
**tous** les abonnements existants, sans possibilité de les récupérer.

### Ce qu'il faut savoir

- Le protocole chiffre de bout en bout : le serveur de distribution (Apple,
  Google, Mozilla) relaie un message qu'il ne peut pas lire. La bibliothèque
  `web-push` s'en charge — l'implémenter à la main demanderait ECDH, HKDF et
  AES-GCM.
- **Un abonnement appartient à un appareil, pas à un compte.** Une personne
  alertée sur son téléphone et sa tablette possède deux abonnements.
- **Un endpoint qui répond 404 ou 410 est supprimé, jamais réessayé** :
  l'application a été désinstallée ou la permission révoquée.
- Chaque envoi laisse une trace dans `notification_deliveries` : une
  notification déjà poussée ne l'est jamais deux fois.

### iPhone

⚠ Push exige **iOS 16.4 minimum** et que l'application soit **installée sur
l'écran d'accueil**. Depuis Safari, la permission ne peut même pas être
demandée. L'interface doit expliquer la marche à suivre au lieu de laisser un
bouton échouer.

⚠ `typeof Notification !== 'undefined'` avant tout accès — voir `06-PWA.md`.

### Pastille

`navigator.setAppBadge()` — et le point important : **la pastille est posée
dans le service worker**, à la réception du message, pas seulement à
l'ouverture de l'application.

C'est tout l'intérêt : application fermée, personne n'exécute le code de la
cloche. Sans cet appel, le chiffre n'apparaîtrait qu'après ouverture — donc
trop tard pour y faire revenir. Le serveur envoie le décompte quand il le
connaît ; à défaut, on incrémente localement d'une unité. Un chiffre approché
vaut mieux qu'une icône muette.

## 6. Canal e-mail

**Resend**, appelé en HTTP brut (`src/lib/email.ts`) — le SDK n'apporterait
qu'une couche à tenir à jour pour un seul appel.

### Configuration

1. Ajouter le domaine dans Resend, publier les enregistrements DNS (SPF, DKIM,
   DMARC), attendre la vérification.
2. `RESEND_API_KEY`, `EMAIL_FROM` (`Nom <notifications@domaine.fr>`).
3. Choisir la région de traitement (`eu-west-1` pour rester dans l'UE).

⚠ Sans domaine vérifié, les messages partent en spam ou pas du tout.

### Gabarits

Deux fichiers, hors du code :

- `emails/base.html` — le cadre visuel, une seule fois ;
- `emails/emails.json` — une entrée par message : objet, titre, contenu HTML,
  libellé de bouton, **et version texte brut**.

Substitutions par `{{VARIABLE}}`. Le texte brut n'est pas optionnel : certains
clients ne rendent pas le HTML, et son absence dégrade la délivrabilité.

⚠ **Échapper systématiquement** tout contenu utilisateur inséré dans le HTML.

### Ton

Sobre. Ces messages doivent se lire en trois secondes, sans images ni
couleurs qui les feraient ressembler à une réclame. Chaque message porte le
motif de réception et le chemin pour couper ce type d'alerte — c'est une
obligation, pas une politesse.

## 7. Acheminement

Deux tâches planifiées, protégées par `CRON_SECRET` :

| Route | Rôle |
|---|---|
| `/api/taches/rappels` | calcule les rappels dus et crée les notifications |
| `/api/taches/acheminer` | pousse et envoie ce qui n'est pas encore livré |

⚠ **Vercel Hobby : une exécution par jour et par tâche.** Enchaîner les
traitements dans une même exécution plutôt que multiplier les créneaux. Un
horaire plus fréquent fait échouer la construction silencieusement.

**Où calculer ?** Coparentalité Zen garde le moteur de planning en TypeScript
et fait appeler la route par le cron, plutôt que de réécrire la logique en SQL
— réécrire créerait **deux vérités concurrentes**. Règle générale : la logique
vit à un seul endroit, et c'est là où elle est testée.

## 8. Brancher le métier sur le moteur

```sql
-- 1. Déclarer le type (donnée, pas structure)
insert into notification_types (code, libelle, categorie, canaux_par_defaut)
values ('solde_bas', 'Solde faible', 'alertes', array['internal','push'])
on conflict (code) do nothing;

-- 2. Émettre par déclencheur
create or replace function public.notifier_solde_bas() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.solde_cents < new.seuil_alerte_cents
     and coalesce(old.solde_cents, 0) >= new.seuil_alerte_cents then
    perform public.notifier(
      destinataires => public.membres_de(new.workspace_id),
      auteur        => new.updated_by,     -- lu dans la ligne, pas auth.uid()
      type          => 'solde_bas',
      titre         => 'Solde faible sur ' || new.libelle,
      lien          => '/app/comptes/' || new.id,
      entite        => 'compte',
      entite_id     => new.id
    );
  end if;
  return new;
end $$;
```

Rien d'autre à écrire : préférences, canaux, livraison, pastille, e-mail et
idempotence sont pris en charge par le socle.

## 9. Discrétions volontaires

Toute modification ne mérite pas une alerte. Coparentalité Zen ne notifie pas
la modification d'une note, ni la correction d'un libellé — seules les dates
et les personnes concernées comptent.

Se poser la question pour chaque type : **cette information mérite-t-elle
d'interrompre quelqu'un ?** Une application qui notifie trop est une
application dont on coupe les notifications.
