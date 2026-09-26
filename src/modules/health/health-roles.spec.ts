// Who may call what: the Health In-charge console is HEALTH_INCHARGE-only; the existing
// read-only oversight stays exactly as it was (and gains no write route).

import { ROLES_KEY } from '../../common/auth/roles.decorator';
import { HealthController } from './health.controller';
import { HealthInchargeController } from './health-incharge.controller';

const roles = (target: object, key?: string): string[] | undefined =>
  Reflect.getMetadata(ROLES_KEY, key ? (target as Record<string, object>)[key] : target);

describe('Health roles', () => {
  it('every Health In-charge route is HEALTH_INCHARGE only (class default, no method widening)', () => {
    expect(roles(HealthInchargeController)).toEqual(['HEALTH_INCHARGE']);
    for (const name of Object.getOwnPropertyNames(HealthInchargeController.prototype)) {
      if (name === 'constructor') continue;
      expect(roles(HealthInchargeController.prototype, name)).toBeUndefined(); // inherits the class default
    }
  });

  it('nobody else (not even Admin) gets the write console', () => {
    const r = roles(HealthInchargeController) ?? [];
    for (const other of ['ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'CORRESPONDENT', 'FACULTY', 'PARENT']) {
      expect(r).not.toContain(other);
    }
  });

  it('the oversight controller is unchanged: read-only, for the four oversight roles, no HEALTH_INCHARGE', () => {
    expect(roles(HealthController)).toEqual(['ADMIN', 'PRINCIPAL', 'CORRESPONDENT', 'VICE_PRINCIPAL']);
    const methods = Object.getOwnPropertyNames(HealthController.prototype).filter((n) => n !== 'constructor');
    expect(methods.length).toBeGreaterThan(0);
    for (const m of methods) {
      const httpMethod = Reflect.getMetadata('method', (HealthController.prototype as unknown as Record<string, object>)[m]);
      expect(httpMethod).toBe(0); // RequestMethod.GET
    }
  });
});
