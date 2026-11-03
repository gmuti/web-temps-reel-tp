// Le navigateur sait-il créer un contexte WebGL 2 (requis par three) ? Faux sur
// les navigateurs anciens, en mode économie ou avec un GPU bloqué.
export function isWebGLAvailable(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    // Libère aussitôt le contexte de test : leur nombre est limité par page.
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return gl !== null
  } catch {
    return false
  }
}
