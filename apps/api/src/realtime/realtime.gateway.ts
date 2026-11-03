import { JwtService } from '@nestjs/jwt';
import {
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
} from '@nestjs/websockets';
import {
  canRoleAccessChatChannel,
  canSeeAllOrders,
  chatChannelRoom,
  ChatSocketEvent,
  FIXED_CHAT_CHANNELS,
  ordersBoardRoom,
  restaurantRoom,
  SOCKET_UNAUTHORIZED,
  userRoom,
  userRoleSchema,
  type ChatAuthor,
} from '@app/shared';
import type { JwtPayload } from '../auth/jwt-payload.type.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { GATEWAY_OPTIONS, type RealtimeServer, type RealtimeSocket } from './realtime.types.js';

/**
 * Cycle de vie des connexions Socket.IO, commun aux commandes et au chat :
 * authentification, salles selon le rôle et présence.
 */
@WebSocketGateway(GATEWAY_OPTIONS)
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private server!: RealtimeServer;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  // Authentification à la poignée de main : l'identité vient du jeton (et de la
  // base pour le nom), jamais du contenu des messages. Un refus déclenche
  // `connect_error` côté client.
  afterInit(server: RealtimeServer) {
    server.use(async (socket, next) => {
      try {
        const token: unknown = socket.handshake.auth?.token;
        if (typeof token !== 'string') throw new Error('missing token');
        const payload = this.jwt.verify<JwtPayload>(token);
        const user = await this.prisma.user.findUnique({
          where: { id: payload.sub },
          select: { name: true, restaurantId: true },
        });
        if (!user?.restaurantId) throw new Error('no restaurant');
        socket.data.user = {
          id: payload.sub,
          name: user.name,
          role: userRoleSchema.parse(payload.role),
          restaurantId: user.restaurantId,
        };
        socket.data.recentMessages = [];
        next();
      } catch {
        next(new Error(SOCKET_UNAUTHORIZED));
      }
    });
  }

  // Salles rejointes d'office : canaux de chat fixes autorisés par le rôle, salle
  // personnelle, et tableau complet des commandes pour les rôles qui le voient.
  // Les discussions de commande sont rejointes à la demande (ChatGateway).
  async handleConnection(client: RealtimeSocket) {
    // Le client a pu se déconnecter pendant l'authentification (ex. double
    // montage React en développement) : rien à rejoindre.
    if (!client.connected) return;
    const { id, restaurantId, role } = client.data.user;
    const rooms = FIXED_CHAT_CHANNELS.filter((channel) =>
      canRoleAccessChatChannel(role, channel),
    ).map((channel) => chatChannelRoom(restaurantId, channel));
    rooms.push(userRoom(id));
    if (canSeeAllOrders(role)) rooms.push(ordersBoardRoom(restaurantId));
    await client.join(rooms);
    await this.publishPresence(restaurantId);
  }

  async handleDisconnect(client: RealtimeSocket) {
    // Une connexion refusée par le middleware n'a pas d'utilisateur.
    const user = client.data.user;
    if (!user) return;
    await this.publishPresence(user.restaurantId);
  }

  /**
   * Présence (cf. sujet : non persistée) : déduite des sockets réellement
   * connectés à la salle du restaurant, plutôt que d'un compteur qui pourrait
   * dériver. Un utilisateur avec plusieurs onglets n'apparaît qu'une fois.
   * `fetchSockets` interroge l'adaptateur : il fonctionne aussi avec plusieurs
   * instances serveur et un adaptateur partagé.
   */
  private async publishPresence(restaurantId: string) {
    const room = restaurantRoom(restaurantId);
    const sockets = await this.server.in(room).fetchSockets();
    const users = new Map<string, ChatAuthor>();
    for (const socket of sockets) {
      const { id, name, role } = socket.data.user;
      users.set(id, { id, name, role });
    }
    this.server.to(room).emit(ChatSocketEvent.PRESENCE_UPDATED, {
      users: [...users.values()].sort((a, b) => a.name.localeCompare(b.name)),
    });
  }
}
