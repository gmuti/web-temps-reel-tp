# Web Temps Réel — Tableau de commandes et chat d'équipe

Application temps réel pour un restaurant : les serveurs prennent les commandes
en salle, la cuisine les fait avancer, le responsable supervise le service, et
toute l'équipe échange dans un chat. Les mises à jour passent par **Socket.IO**.

Projet réalisé dans le cadre du module Web Temps Réel (Master 2). L'énoncé est
dans [`docs/sujet.md`](docs/sujet.md).

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Démarrage rapide](#démarrage-rapide)
- [Architecture](#architecture)
- [Règles métier](#règles-métier)
- [API REST](#api-rest)
- [Contrats Socket.IO](#contrats-socketio)
- [Reconnexion et journal d'événements](#reconnexion-et-journal-dévénements)
- [Développement sans Docker](#développement-sans-docker)
- [Tests](#tests)
- [Dépannage](#dépannage)

## Fonctionnalités

**Serveur (salle)**
- Prise de commande depuis la carte : photo de chaque plat, quantité, contrainte
  libre par plat (« sans oignon »), commentaire général.
- Ne voit que ses propres commandes, mises à jour en direct.
- Valide une commande, puis la marque servie quand elle est prête.

**Cuisine**
- Prend en charge les commandes validées puis les marque prêtes.

**Responsable**
- Voit toutes les commandes du restaurant, peut effectuer toutes les
  transitions et est le seul à pouvoir annuler.

**Pour tout le monde**
- Tableau en **kanban** : À valider, Validée, En préparation, Prête.
- **Plan de salle 3D** (bouton « Plan », à côté du kanban) : vue isométrique
  de la salle où chaque table prend la couleur de sa commande la plus urgente,
  avec le nombre de commandes, le temps d'attente et les messages non lus ;
  assiettes prêtes sur le passe, tickets et fourneaux en cuisine. Un clic sur
  une table ouvre ses commandes, avec les mêmes actions que le kanban, et
  permet d'en créer une pour cette table. Caméra isométrique fixe ou libre.
  Les événements en direct sont animés (ticket qui part en cuisine, assiette du
  fourneau au passe puis du passe à la table, anneau sous une nouvelle
  commande), les tables en retard sont signalées, et les personnes connectées
  apparaissent dans leur zone (cuisine, salle, entrée). La cuisine voit d'abord
  sa zone.
  Le mobilier vient du [Furniture Kit de Kenney](https://kenney.nl/assets/furniture-kit)
  (CC0, licence dans `apps/web/public/models/kenney-furniture/`).
- Sur chaque commande : carrousel des photos des plats, contraintes en badge.
- **Chat d'équipe** : canal Général, canaux Cuisine et Salle selon le rôle, et
  une discussion par commande ; historique, auteur et heure de chaque message,
  liste des personnes en ligne.
- Indicateur de connexion (connecté, reconnexion…), rattrapage automatique
  après une coupure.
- Messages d'erreur explicites quand une action est refusée (droits,
  modification concurrente, transition invalide).

## Démarrage rapide

Prérequis : Docker et Docker Compose.

```bash
docker compose up --build
```

Au démarrage, le conteneur `api` applique les migrations
(`prisma migrate deploy`) puis charge les données de démo (`prisma db seed`,
idempotent). Aucune autre commande n'est nécessaire.

| Service | URL |
|---|---|
| Application | http://localhost:5173 |
| API | http://localhost:3001 (`/health` vérifie la base) |
| PostgreSQL | localhost:5432 |

Comptes de démo (restaurant « Chez Demo », mot de passe `password123`) :

| Rôle | Email |
|---|---|
| Serveur | `serveur@chez-demo.local` |
| Cuisine | `cuisine@chez-demo.local` |
| Responsable | `responsable@chez-demo.local` |
| Manager (administration, canal Général uniquement) | `manager@chez-demo.local` |

Un fichier `.env` (copie de [`.env.example`](.env.example)) n'est utile que
pour changer les valeurs par défaut : ports, identifiants PostgreSQL, secret JWT.

## Architecture

Monorepo npm workspaces :

```text
apps/
  api/      NestJS 12 (Node 22, ESM) + Prisma 7 + PostgreSQL + Socket.IO
  web/      React 19 + Vite + Tailwind CSS + shadcn/ui
shared/     @app/shared : schémas Zod et types communs au front et à l'API
docs/       énoncé du cours
scripts/    outillage Docker (binaires natifs Linux)
docker-compose.yml
```

- **`shared`** est la source unique des contrats : schémas Zod des commandes,
  des plats et des messages, noms des événements Socket.IO, règles de
  transition et de droits. Le front et l'API valident les mêmes données avec
  les mêmes schémas.
- **Le serveur est l'autorité** : un client ne modifie jamais l'état
  directement. Il envoie une demande, reçoit un accusé de réception, puis
  l'état change à réception de l'événement publié par le serveur, émetteur
  compris.
- **Une seule connexion Socket.IO** par client, partagée par le tableau et le
  chat. L'identité vient du jeton JWT vérifié à la poignée de main, jamais du
  contenu des messages.
- **Mêmes règles en REST et en Socket.IO** : les deux passent par les mêmes
  services (`OrdersService`, `ChatService`).

Côté API (`apps/api/src`) :

| Module | Rôle |
|---|---|
| `auth`, `users` | Inscription, connexion, JWT (bcrypt pour les mots de passe) |
| `realtime` | Connexion Socket.IO : authentification, salles selon le rôle, présence |
| `orders` | Commandes : REST, passerelle Socket.IO, journal d'événements |
| `chat` | Canaux, messages, historique, limite de fréquence |
| `dishes` | Carte du restaurant |

Côté front (`apps/web/src`) : `lib/use-realtime-socket.ts` (connexion et
accusés de réception), `lib/use-orders-realtime.ts` (tableau et rattrapage),
`lib/use-chat.ts` (chat et présence), et les composants du kanban, du
formulaire de commande et du chat.

Le plan de salle (`components/floor-plan/`) est une seconde vue branchée sur
le même état qu'`OrderBoard` : il ne se connecte pas au socket.
`floor-scene-model.ts` déduit l'état de chaque table des commandes (fonction
pure, testée) et la scène React Three Fiber ne fait que l'afficher. Le plan est
statique (`floor-plan-data.ts`) ; les commandes dont la table n'y figure pas
apparaissent dans « Hors plan ». three étant lourd (~260 Ko gzip), la vue est
chargée à la demande, rendue seulement quand quelque chose change, et
remplacée par le kanban si WebGL est indisponible ou perdu. Les modèles
`.glb` (11 fichiers, ~180 Ko, ~47 Ko en gzip) sont servis depuis `public/` et
préchargés à l'ouverture du plan ; tant qu'ils chargent, ou s'ils échouent, le
mobilier est dessiné en formes simples (`scene/kit-model.tsx`).

Les animations partent des événements reçus en direct (`onLiveEvent` de
`useOrdersRealtime`), jamais de ceux rejoués lors d'un rattrapage : après une
coupure, la scène se remet à jour sans rejouer d'animations. `order-effects.ts`
traduit un événement en effet (fonction pure, testée), avec un garde-fou contre
les rafales ; rien n'est animé onglet masqué ou avec « réduire les animations ».

## Règles métier

### Cycle de vie d'une commande

```text
À valider ──► Validée ──► En préparation ──► Prête ──► Servie
    │            │
    └────────────┴──► Annulée
```

| Transition vers | Rôles autorisés |
|---|---|
| Validée | Serveur, Responsable |
| En préparation | Cuisine, Responsable |
| Prête | Cuisine, Responsable |
| Servie | Serveur, Responsable |
| Annulée | Responsable |

Toute demande précise le statut attendu (`expectedStatus`). Si la commande a
été modifiée entre-temps par quelqu'un d'autre, la demande est refusée
(`409 STATUS_CONFLICT`) ; la vérification et la mise à jour sont atomiques.

Un serveur ne voit et ne modifie que ses propres commandes ; les autres rôles
voient toutes celles du restaurant. Le nom et le prix des plats sont lus dans
la carte côté serveur, jamais fournis par le client.

### Canaux de chat

| Canal | Accès |
|---|---|
| Général | Tous |
| Cuisine | Cuisine, Responsable |
| Salle | Serveur, Responsable |
| Discussion d'une commande | Serveur (ses commandes), Cuisine, Responsable |

Les messages sont enregistrés en base (500 caractères au plus, 5 messages par
tranche de 10 secondes et par connexion). Un message renvoyé après une coupure
n'est pas dupliqué (`clientMessageId`).

## API REST

Toutes les routes sauf `/health` et `/auth/*` exigent un jeton
(`Authorization: Bearer <token>`). Le restaurant et l'auteur sont déduits du
jeton.

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/health` | État de l'API et de la base |
| `POST` | `/auth/register` | Création de compte |
| `POST` | `/auth/login` | Connexion, renvoie le jeton |
| `GET` | `/dishes` | Carte du restaurant |
| `GET` | `/orders?status=` | Commandes visibles (en cours par défaut) |
| `POST` | `/orders` | Création d'une commande (idempotente via `clientOrderId`) |
| `PATCH` | `/orders/:orderId/status` | Demande de transition |

Les écritures faites en REST sont publiées aux clients Socket.IO comme celles
faites par le socket.

## Contrats Socket.IO

Les types sont définis dans [`shared/src/realtime.ts`](shared/src/realtime.ts)
et [`shared/src/chat.ts`](shared/src/chat.ts).

Commandes envoyées par le client, avec accusé de réception
`{ accepted: true, ... }` ou `{ accepted: false, errorCode, message }` :

| Événement | Données | Accusé |
|---|---|---|
| `order:create` | `{ tableNumber, items: [{ dishId, quantity, note? }], comment?, clientOrderId }` | `orderId` |
| `order:status:update` | `{ orderId, expectedStatus, requestedStatus }` | `orderId` |
| `order:sync` | `{}` | `orders`, `lastEventId` |
| `order:events:since` | `{ after }` | `events`, `complete` |
| `chat:channel:join` | `{ channelId }` | `messages` (50 derniers) |
| `chat:channel:leave` | `{ channelId }` | — |
| `chat:message:create` | `{ channelId, clientMessageId, content }` | `messageId` |

Événements publiés par le serveur :

| Événement | Destinataires |
|---|---|
| `order:created` | Rôles qui voient tout le tableau et serveur de la commande |
| `order:status-updated` | Idem |
| `chat:message:created` | Membres du canal |
| `presence:updated` | Tout le restaurant |

Salles : `restaurant:<id>` (canal Général et présence),
`restaurant:<id>:kitchen`, `restaurant:<id>:service`,
`restaurant:<id>:orders` (tableau complet), `user:<id>` (serveur de la
commande), `order:<id>` (discussion d'une commande). Une salle ne fait que
router la diffusion : les droits sont vérifiés à chaque action.

## Reconnexion et journal d'événements

Chaque création de commande et chaque changement de statut est enregistré dans
le journal (`OrderEvent`), dans la même transaction que la modification.
L'identifiant croissant de l'entrée sert d'`eventId`.

1. À la première connexion, le client demande un instantané (`order:sync`) et
   retient la position du journal.
2. À chaque événement reçu, il met à jour cette position.
3. À la reconnexion, il demande les événements manqués (`order:events:since`).
   Au-delà de 500 événements, il refait un instantané.
4. Les événements reçus pendant le rattrapage sont mis en attente puis
   appliqués dans l'ordre ; un événement déjà appliqué est ignoré.

Le chat recharge l'historique de chaque canal ouvert à la reconnexion.

## Développement sans Docker

Prérequis : Node 22 et un PostgreSQL accessible (par exemple
`docker compose up postgres`).

```bash
npm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

cd apps/api
npx prisma migrate deploy
npx prisma generate
npx prisma db seed
cd ../..

npm run dev:api   # http://localhost:3001
npm run dev:web   # http://localhost:5173
```

Après une modification du schéma : `npx prisma migrate dev --name <nom>` puis
`npx prisma generate` (Prisma 7 ne régénère plus le client automatiquement).

## Tests

Les tests e2e de l'API utilisent la base configurée dans `apps/api/.env` :

```bash
cd apps/api
npm run test:e2e   # REST et Socket.IO
npm test           # tests unitaires
npm run lint
```

Ils peuvent aussi être lancés dans le conteneur :
`docker compose exec api npm run test:e2e --workspace apps/api`.

Côté front, `npm test --workspace apps/web` lance les tests unitaires (Vitest)
du modèle du plan de salle.

## Dépannage

Notes utiles sous Windows, notamment avec un dépôt synchronisé par OneDrive :

- **Dépendances modifiées** : les `node_modules` des conteneurs sont dans des
  volumes nommés, qui ne se mettent pas à jour seuls. Après un changement de
  `package.json`, supprimer les volumes `*-node-modules` du service concerné
  puis relancer `docker compose up --build`.
- **Binaires natifs** : le `package-lock.json` généré sous Windows ne contient
  pas les binaires Linux de rolldown, Tailwind et lightningcss. Les Dockerfiles
  les installent via [`scripts/linux-native-deps.cjs`](scripts/linux-native-deps.cjs).
- **Rechargement à chaud** : les modifications de fichiers ne traversent pas le
  montage Docker ; Vite scrute donc les fichiers (`VITE_USE_POLLING`).
  Redémarrer le conteneur `api` après une modification du backend si elle
  n'est pas prise en compte.
- **Lenteur** : `npm install` et le premier démarrage de Nest peuvent être
  lents sur un dossier synchronisé ; exclure le dépôt de la synchronisation
  améliore nettement les temps.
