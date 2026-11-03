# Front — React + Vite + shadcn/ui

Interface du tableau de commandes et du chat. Vue d'ensemble, contrats et
démarrage : voir le [README principal](../../README.md).

## Organisation

```text
src/
  lib/
    api.ts                 client HTTP (connexion, carte)
    auth-context.tsx       session (jeton conservé dans localStorage)
    use-realtime-socket.ts connexion Socket.IO partagée, accusés de réception
    use-orders-realtime.ts tableau en direct, rattrapage après coupure
    use-chat.ts            canaux, messages, non-lus, présence
  components/
    order-board.tsx        page principale : kanban + chat
    order-card.tsx         carte d'une commande (carrousel, contraintes, actions)
    dish-carousel.tsx      carrousel des photos des plats
    create-order-dialog.tsx formulaire de commande à partir de la carte
    chat-panel.tsx         panneau de chat
    login-form.tsx
    ui/                    composants shadcn/ui
public/dishes/             illustrations des plats (remplaçables par des photos)
```

Toutes les données reçues (HTTP, accusés, événements) sont validées avec les
schémas Zod de `@app/shared`.

## Commandes

```bash
npm run dev      # http://localhost:5173
npm run build
npm run lint
```

Variable d'environnement : `VITE_API_URL` (voir `.env.example`). Dans Docker,
`VITE_USE_POLLING=true` active la scrutation des fichiers par Vite.
