import type { Request } from 'express';
import type { DeviceContext } from './identity.service';

/** A device id is a random per-install id the client generates (mobile: SecureStore,
 * web: cookie) and sends as X-Device-Id. It only NAMES a phone -- it grants nothing
 * by itself -- so validation is just "looks like one". */
const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export function deviceContextFrom(req: Request): DeviceContext {
  const userAgent = req.headers['user-agent'];
  const rawDeviceId = req.headers['x-device-id'];
  const deviceId = Array.isArray(rawDeviceId) ? rawDeviceId[0] : rawDeviceId;
  return {
    ipAddress: req.ip ?? null,
    userAgent: Array.isArray(userAgent)
      ? (userAgent[0] ?? null)
      : (userAgent ?? null),
    deviceId: deviceId && DEVICE_ID_PATTERN.test(deviceId) ? deviceId : null,
  };
}
