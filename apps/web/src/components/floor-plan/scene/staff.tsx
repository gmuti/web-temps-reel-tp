import type { UserRole } from '@app/shared'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import type { Group } from 'three'
import { STAFF_LABEL_Y } from '../floor-plan-data'
import type { StaffView } from '../floor-scene-model'
import type { LabelAnchors } from '../scene-labels'
import { positionAt, type Waypoint } from '../staff-routes'

// Tenue selon le rôle : veste blanche en cuisine, noir en salle, bleu pour l'encadrement.
const ROLE_COLORS: Record<UserRole, string> = {
  COOK: '#f5f5f4',
  WAITER: '#27272a',
  RESPONSABLE: '#2563eb',
  MANAGER: '#7c3aed',
}
const SKIN = '#e0b48f'

const BODY_RADIUS = 0.18
const BODY_LENGTH = 0.75

export type StaffTrip = { waypoints: Waypoint[]; startedAt: number }

type StaffMemberProps = {
  member: StaffView
  trip: StaffTrip | undefined
  anchors: LabelAnchors
  onTripDone: (userId: string, startedAt: number) => void
}

// Une silhouette : à son poste, ou en déplacement le long de son trajet.
function StaffMember({ member, trip, anchors, onTripDone }: StaffMemberProps) {
  const ref = useRef<Group>(null)
  const invalidate = useThree((state) => state.invalidate)
  const { user } = member

  // Un nouveau trajet démarre : une première image lance l'animation.
  useEffect(() => invalidate(), [trip, invalidate])

  useFrame(() => {
    const group = ref.current
    if (!group) return
    const position = trip
      ? positionAt(trip.waypoints, performance.now() - trip.startedAt)
      : { x: member.x, z: member.z, done: true }
    group.position.set(position.x, 0, position.z)
    // L'étiquette suit la silhouette (sa projection à l'écran est faite ensuite
    // par LabelProjector, monté après le personnel).
    anchors.get(`staff:${user.id}`)?.position.set(position.x, STAFF_LABEL_Y, position.z)
    if (!trip) return
    if (position.done) onTripDone(user.id, trip.startedAt)
    else invalidate()
  })

  return (
    <group ref={ref} position={[member.x, 0, member.z]}>
      <mesh position-y={BODY_RADIUS + BODY_LENGTH / 2}>
        <capsuleGeometry args={[BODY_RADIUS, BODY_LENGTH, 4, 12]} />
        <meshStandardMaterial color={ROLE_COLORS[user.role]} />
      </mesh>
      <mesh position-y={BODY_RADIUS * 2 + BODY_LENGTH + 0.15}>
        <sphereGeometry args={[0.15, 16, 12]} />
        <meshStandardMaterial color={SKIN} />
      </mesh>
    </group>
  )
}

type StaffProps = {
  staff: StaffView[]
  trips: Record<string, StaffTrip>
  anchors: LabelAnchors
  onTripDone: (userId: string, startedAt: number) => void
}

// Personnes connectées, en silhouettes simples, à leur poste ou en déplacement.
export function Staff({ staff, trips, anchors, onTripDone }: StaffProps) {
  return staff.map((member) => (
    <StaffMember
      key={member.user.id}
      member={member}
      trip={trips[member.user.id]}
      anchors={anchors}
      onTripDone={onTripDone}
    />
  ))
}
