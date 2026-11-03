// Liste les binaires natifs Linux (musl, x64) attendus par les dépendances, avec
// leur version exacte, à partir de package-lock.json.
//
// Le lockfile est généré sous Windows et, à cause d'un bug npm sur les
// dépendances optionnelles (https://github.com/npm/cli/issues/4828), il ne
// contient que les binaires win32 : `npm install` dans une image Alpine ne
// récupère alors pas ceux de rolldown, tailwind (oxide), lightningcss...
// Les Dockerfiles les installent explicitement avec la sortie de ce script.
const lock = require('../package-lock.json');

const wanted = new Map();
for (const meta of Object.values(lock.packages)) {
  for (const [name, version] of Object.entries(meta.optionalDependencies ?? {})) {
    if (name.endsWith('linux-x64-musl')) wanted.set(name, version);
  }
}

console.log([...wanted].map(([name, version]) => `${name}@${version}`).join(' '));
