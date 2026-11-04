// Panneau de table ouvert par-dessus le plan (handoff § 6.3) : latéral à droite, ou
// feuille mobile en bas. Sans dépendance à three : partagé par la caméra (chunk 3D)
// et par l'OrderBoard.
export type PanelLayout = 'side' | 'sheet' | null

export const SIDE_PANEL_WIDTH = 440
export const SHEET_HEIGHT_RATIO = 0.6
