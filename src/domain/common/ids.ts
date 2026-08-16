export type SessionId = string & { readonly __brand: 'SessionId' };
export type CaptureId = string & { readonly __brand: 'CaptureId' };
export type ImageId = string & { readonly __brand: 'ImageId' };

export function createSessionId(): SessionId {
  return crypto.randomUUID() as SessionId;
}

export function createCaptureId(): CaptureId {
  return crypto.randomUUID() as CaptureId;
}

export function createImageId(): ImageId {
  return crypto.randomUUID() as ImageId;
}
