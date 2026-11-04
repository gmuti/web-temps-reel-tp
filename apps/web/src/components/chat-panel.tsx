import type { ChatAuthor, ChatMessageCreatedEvent } from '@app/shared'
import { SendIcon, XIcon } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { ROLE_LABELS } from '@/lib/role-labels'
import type { ChatChannel } from '@/lib/use-chat'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

const timeFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })

type ChatPanelProps = {
  // Hauteur et position, imposées par le conteneur (panneau rétractable du mode Plan).
  className?: string
  currentUserId: string
  isConnected: boolean
  channels: ChatChannel[]
  activeChannelId: string
  messages: ChatMessageCreatedEvent[]
  unread: Record<string, number>
  online: ChatAuthor[]
  onSelectChannel: (channelId: ChatChannel['id']) => void
  onCloseChannel: (channelId: ChatChannel['id']) => void
  onSend: (content: string) => Promise<unknown>
}

export function ChatPanel({
  className,
  currentUserId,
  isConnected,
  channels,
  activeChannelId,
  messages,
  unread,
  online,
  onSelectChannel,
  onCloseChannel,
  onSend,
}: ChatPanelProps) {
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  // Garde le dernier message visible.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages, activeChannelId])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const content = draft.trim()
    if (!content) return
    setIsSending(true)
    try {
      // Le message s'affiche à réception de `chat:message:created`, pas ici.
      await onSend(content)
      setDraft('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Message non envoyé.')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <Card className={cn('flex h-[70svh] flex-col gap-0 py-0 lg:sticky lg:top-6 lg:h-[calc(100svh-3rem)]', className)}>
      <CardHeader className="gap-2 border-b py-4">
        <CardTitle>Chat d'équipe</CardTitle>
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <span className="text-muted-foreground">{online.length} en ligne :</span>
          {online.map((member) => (
            <Badge key={member.id} variant="outline" className="gap-1">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              {member.name}
            </Badge>
          ))}
        </div>
      </CardHeader>

      <div className="flex flex-wrap gap-1 border-b p-2" role="tablist">
        {channels.map((channel) => {
          const isActive = channel.id === activeChannelId
          const count = unread[channel.id] ?? 0
          return (
            <div key={channel.id} className="flex items-center">
              <Button
                role="tab"
                aria-selected={isActive}
                size="sm"
                variant={isActive ? 'default' : 'ghost'}
                onClick={() => onSelectChannel(channel.id)}
              >
                {channel.label}
                {count > 0 && !isActive && (
                  <Badge variant="destructive" className="ml-1 h-4 min-w-4 px-1">
                    {count}
                  </Badge>
                )}
              </Button>
              {channel.closable && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => onCloseChannel(channel.id)}
                  aria-label={`Fermer la discussion ${channel.label}`}
                >
                  <XIcon />
                </Button>
              )}
            </div>
          )
        })}
      </div>

      <CardContent ref={listRef} className="flex flex-1 flex-col gap-3 overflow-y-auto py-3">
        {messages.length === 0 ? (
          <p className="text-muted-foreground m-auto text-sm">Aucun message pour l'instant.</p>
        ) : (
          messages.map((message) => {
            const isMine = message.author.id === currentUserId
            return (
              <div key={message.messageId} className={cn('flex flex-col gap-0.5', isMine && 'items-end')}>
                <div className="text-muted-foreground text-xs">
                  {isMine ? 'Toi' : message.author.name} · {ROLE_LABELS[message.author.role]} ·{' '}
                  <time dateTime={message.createdAt.toISOString()}>{timeFormat.format(message.createdAt)}</time>
                </div>
                <p
                  className={cn(
                    'max-w-[85%] rounded-lg px-3 py-1.5 text-sm break-words whitespace-pre-wrap',
                    isMine ? 'bg-primary text-primary-foreground' : 'bg-muted',
                  )}
                >
                  {message.content}
                </p>
              </div>
            )
          })
        )}
      </CardContent>

      <form onSubmit={handleSubmit} className="flex gap-2 border-t p-3">
        <Input
          className="h-11"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={isConnected ? 'Écrire un message…' : 'Connexion perdue…'}
          maxLength={500}
          disabled={!isConnected}
          aria-label="Message"
        />
        <Button type="submit" size="icon-lg" disabled={!isConnected || isSending || !draft.trim()} aria-label="Envoyer">
          <SendIcon />
        </Button>
      </form>
    </Card>
  )
}
