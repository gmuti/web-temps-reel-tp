# API — NestJS + Prisma + Socket.IO

API du tableau de commandes et du chat. Vue d'ensemble, contrats et démarrage :
voir le [README principal](../../README.md).

## Organisation

```text
src/
  auth/       inscription, connexion, JWT (garde HTTP JwtAuthGuard)
  users/      comptes, hachage des mots de passe
  realtime/   connexion Socket.IO : authentification, salles, présence, accusés
  orders/     commandes : REST, passerelle Socket.IO, journal d'événements
  chat/       canaux, messages, historique, limite de fréquence
  dishes/     carte du restaurant
  health/     état de l'API et de la base
  prisma/     client Prisma (adaptateur pg)
  generated/  client Prisma généré (non versionné)
prisma/
  schema.prisma, migrations/, seed.ts (données de démo idempotentes)
test/         tests e2e (REST et Socket.IO)
```

Les trois passerelles Socket.IO (`RealtimeGateway`, `OrdersGateway`,
`ChatGateway`) partagent le même serveur. Les règles métier sont dans les
services (`OrdersService`, `ChatService`), utilisés à la fois par les
contrôleurs REST et par les passerelles.

## Commandes

```bash
npm run start:dev    # API avec rechargement (port 3001)
npm run test:e2e     # tests e2e, sur la base de .env
npm test             # tests unitaires
npm run lint

npx prisma migrate dev --name <nom>   # nouvelle migration
npx prisma generate                   # à relancer après chaque migration (Prisma 7)
npx prisma db seed                    # données de démo
```

La configuration Prisma (URL de la base, seed) est dans `prisma.config.ts`, pas
dans `schema.prisma`. Variables d'environnement : voir `.env.example`.
