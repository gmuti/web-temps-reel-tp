import type { UserRole } from '@app/shared'
import type { StaffView } from '../floor-scene-model'

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

// Personnes connectées, en silhouettes simples dans la zone de leur rôle.
export function Staff({ staff }: { staff: StaffView[] }) {
  return staff.map(({ user, x, z }) => (
    <group key={user.id} position={[x, 0, z]}>
      <mesh position-y={BODY_RADIUS + BODY_LENGTH / 2}>
        <capsuleGeometry args={[BODY_RADIUS, BODY_LENGTH, 4, 12]} />
        <meshStandardMaterial color={ROLE_COLORS[user.role]} />
      </mesh>
      <mesh position-y={BODY_RADIUS * 2 + BODY_LENGTH + 0.15}>
        <sphereGeometry args={[0.15, 16, 12]} />
        <meshStandardMaterial color={SKIN} />
      </mesh>
    </group>
  ))
}
