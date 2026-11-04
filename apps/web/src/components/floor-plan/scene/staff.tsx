import type { UserRole } from '@app/shared'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import type { Group } from 'three'
import { COOK_STATIONS, STAFF_LABEL_Y } from '../floor-plan-data'
import type { StaffView } from '../floor-scene-model'
import type { LabelAnchors } from '../scene-labels'
import { positionAt, type Waypoint } from '../staff-routes'

// Tenue selon le rôle (handoff § 6.4) : veste blanche et toque en cuisine, noir en
// salle, gris foncé avec tablier pour le responsable, grège pour le manager. Aucune
// ne reprend une couleur d'état (le bleu et le violet se confondaient avec « Validée »
// et « À débarrasser »).
const ROLE_COLORS: Record<UserRole, string> = {
  COOK: '#fafafa',
  WAITER: '#27272a',
  RESPONSABLE: '#3f3f46',
  MANAGER: '#a8a29e',
}
const APRON = '#c8b89c'
const TOQUE = '#ffffff'
const SKIN = '#e0b48f'
const PAN = '#3f3f46'
const FOOD = '#e8c07d'
// Durée d'un geste de cuisine (sauter la poêle, ou un tour de cuillère).
const COOK_CYCLE_S = 1.3

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const BODY_RADIUS = 0.18
const BODY_LENGTH = 0.75

export type StaffTrip = { waypoints: Waypoint[]; startedAt: number }

type StaffMemberProps = {
  member: StaffView
  trip: StaffTrip | undefined
  // Commande en préparation pour ce poste : le cuisinier cuisine en boucle.
  cooking: boolean
  anchors: LabelAnchors
  onTripDone: (userId: string, startedAt: number) => void
}

// Une silhouette : à son poste, ou en déplacement le long de son trajet.
function StaffMember({ member, trip, cooking, anchors, onTripDone }: StaffMemberProps) {
  const ref = useRef<Group>(null)
  const panRef = useRef<Group>(null)
  const foodRef = useRef<Group>(null)
  // À son poste seulement (pas pendant un trajet), et sans animation si l'utilisateur les réduit.
  const atStation = cooking && !trip
  const animated = atStation && !prefersReducedMotion()
  const stationKind = member.station !== null ? (COOK_STATIONS[member.station]?.kind ?? 'island') : 'island'
  const invalidate = useThree((state) => state.invalidate)
  const { user } = member

  // Un nouveau trajet démarre, ou la cuisine commence : une première image lance l'animation.
  useEffect(() => invalidate(), [trip, atStation, invalidate])

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
    // Geste en boucle : au fourneau, la poêle se soulève et bascule, et la garniture saute ;
    // à l'îlot, la cuillère tourne dans le saladier.
    if (animated) {
      const pan = panRef.current
      const food = foodRef.current
      if (pan && food) {
        const phase = (performance.now() / 1000 / COOK_CYCLE_S) % 1
        if (stationKind === 'stove') {
          const toss = Math.max(0, Math.sin(phase * Math.PI * 2))
          pan.position.y = 0.04 * toss
          pan.rotation.x = -0.35 * toss
          food.position.set(0, 0.04 + 0.32 * Math.sin(phase * Math.PI), 0)
        } else {
          pan.rotation.y = phase * Math.PI * 2
          food.position.set(0.05 * Math.cos(phase * Math.PI * 2), 0.04, 0.05 * Math.sin(phase * Math.PI * 2))
        }
      }
      invalidate()
    }
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
      {user.role === 'COOK' && (
        // Toque blanche
        <mesh position-y={BODY_RADIUS * 2 + BODY_LENGTH + 0.36}>
          <cylinderGeometry args={[0.15, 0.12, 0.22, 16]} />
          <meshStandardMaterial color={TOQUE} />
        </mesh>
      )}
      {user.role === 'RESPONSABLE' && (
        // Tablier, côté salle (devant la silhouette en vue iso)
        <mesh position={[0, 0.55, BODY_RADIUS - 0.01]}>
          <boxGeometry args={[0.3, 0.5, 0.03]} />
          <meshStandardMaterial color={APRON} />
        </mesh>
      )}
      {atStation && (
        // Ustensile tenu devant soi, côté poste (-z) : poêle au fourneau, saladier à l'îlot.
        <group position={[0, 1.0, -0.4]}>
          <group ref={panRef}>
            <mesh>
              <cylinderGeometry args={stationKind === 'stove' ? [0.16, 0.13, 0.04, 20] : [0.15, 0.1, 0.12, 20]} />
              <meshStandardMaterial color={stationKind === 'stove' ? PAN : '#e7e5e4'} />
            </mesh>
            {stationKind === 'stove' ? (
              <mesh position={[0, 0, 0.24]}>
                <boxGeometry args={[0.04, 0.03, 0.22]} />
                <meshStandardMaterial color={PAN} />
              </mesh>
            ) : (
              <mesh position={[0.05, 0.12, 0]} rotation-z={0.35}>
                <cylinderGeometry args={[0.012, 0.012, 0.3, 8]} />
                <meshStandardMaterial color="#a1887f" />
              </mesh>
            )}
          </group>
          <group ref={foodRef} position-y={0.04}>
            <mesh>
              <sphereGeometry args={[0.05, 10, 8]} />
              <meshStandardMaterial color={FOOD} />
            </mesh>
          </group>
        </group>
      )}
    </group>
  )
}

type StaffProps = {
  staff: StaffView[]
  trips: Record<string, StaffTrip>
  // Commandes en préparation : le poste i cuisine s'il y en a au moins i + 1.
  cookingCount: number
  anchors: LabelAnchors
  onTripDone: (userId: string, startedAt: number) => void
}

// Personnes connectées, en silhouettes simples, à leur poste ou en déplacement.
export function Staff({ staff, trips, cookingCount, anchors, onTripDone }: StaffProps) {
  return staff.map((member) => (
    <StaffMember
      key={member.user.id}
      member={member}
      trip={trips[member.user.id]}
      cooking={member.station !== null && member.station < cookingCount}
      anchors={anchors}
      onTripDone={onTripDone}
    />
  ))
}
