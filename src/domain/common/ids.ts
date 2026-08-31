export type SessionId = string & { readonly __brand: 'SessionId' };
export type PageId = string & { readonly __brand: 'PageId' };
export type CaptureId = PageId;
export type ImageId = string & { readonly __brand: 'ImageId' };

export function createSessionId(): SessionId {
  return crypto.randomUUID() as SessionId;
}

export function createPageId(): PageId {
  return crypto.randomUUID() as PageId;
}

export function createCaptureId(): CaptureId {
  return createPageId();
}

export function createImageId(): ImageId {
  return crypto.randomUUID() as ImageId;
}
