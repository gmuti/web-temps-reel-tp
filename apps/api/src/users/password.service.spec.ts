import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('produit un hash différent du mot de passe en clair', async () => {
    const hash = await service.hash('un-mot-de-passe-solide');
    expect(hash).not.toBe('un-mot-de-passe-solide');
  });

  it('vérifie correctement un mot de passe valide et rejette un mot de passe invalide', async () => {
    const hash = await service.hash('un-mot-de-passe-solide');

    await expect(service.verify('un-mot-de-passe-solide', hash)).resolves.toBe(true);
    await expect(service.verify('mauvais-mot-de-passe', hash)).resolves.toBe(false);
  });
});
