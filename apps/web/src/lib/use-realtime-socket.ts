import { SOCKET_UNAUTHORIZED, type AckFailure, type ClientToServerEvents, type ServerToClientEvents } from '@app/shared'
import { useEffect, useMemo, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { API_URL } from '@/lib/api'

export type RealtimeSocket = Socket<ServerToClientEvents, ClientToServerEvents>

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'offline'

// Délai au-delà duquel une demande sans accusé de réception est considérée perdue.
const ACK_TIMEOUT_MS = 5000

export class AckError extends Error {
  errorCode: string

  constructor(errorCode: string, message: string) {
    super(message)
    this.name = 'AckError'
    this.errorCode = errorCode
  }
}

type AckOf<E extends keyof ClientToServerEvents> =
  Parameters<ClientToServerEvents[E]> extends [unknown, (response: infer A) => void] ? A : never

/**
 * Envoie une commande au serveur et attend son accusé de réception. Lève une
 * AckError si la connexion est coupée, si le délai expire ou si le serveur refuse.
 */
export async function emitWithAck<E extends keyof ClientToServerEvents>(
  socket: RealtimeSocket | null,
  event: E,
  payload: Parameters<ClientToServerEvents[E]>[0],
): Promise<Exclude<AckOf<E>, AckFailure>> {
  if (!socket?.connected) {
    throw new AckError('OFFLINE', 'Pas de connexion au serveur.')
  }
  let ack: AckOf<E>
  try {
    ack = await (socket.timeout(ACK_TIMEOUT_MS).emitWithAck as (e: E, p: typeof payload) => Promise<AckOf<E>>)(
      event,
      payload,
    )
  } catch {
    throw new AckError('TIMEOUT', 'Le serveur n’a pas confirmé la demande.')
  }
  const result = ack as AckOf<E> & { accepted: boolean }
  if (!result.accepted) {
    const failure = result as unknown as AckFailure
    throw new AckError(failure.errorCode, failure.message)
  }
  return result as Exclude<AckOf<E>, AckFailure>
}

/**
 * Connexion Socket.IO unique, partagée par le tableau de commandes et le chat.
 * L'identité est transmise par le jeton à la poignée de main ; un refus
 * d'authentification déconnecte l'utilisateur. Le socket est créé sans se
 * connecter (`autoConnect: false`) : seul l'effet ouvre et ferme la connexion.
 */
export function useRealtimeSocket(accessToken: string | null, onUnauthorized: () => void) {
  const socket = useMemo<RealtimeSocket | null>(
    () => (accessToken ? io(API_URL, { auth: { token: accessToken }, autoConnect: false }) : null),
    [accessToken],
  )
  const [connection, setConnection] = useState<ConnectionState>('connecting')
  const onUnauthorizedRef = useRef(onUnauthorized)

  useEffect(() => {
    onUnauthorizedRef.current = onUnauthorized
  }, [onUnauthorized])

  useEffect(() => {
    if (!socket) return

    const onConnect = () => setConnection('connected')
    // Déconnexion volontaire du serveur : Socket.IO ne retente pas seul.
    const onDisconnect = (reason: string) =>
      setConnection(reason === 'io server disconnect' ? 'offline' : 'reconnecting')
    const onConnectError = (err: Error) => {
      if (err.message === SOCKET_UNAUTHORIZED) onUnauthorizedRef.current()
      else setConnection('reconnecting')
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onConnectError)
    socket.connect()

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onConnectError)
      socket.disconnect()
    }
  }, [socket])

  return { socket, connection }
}
