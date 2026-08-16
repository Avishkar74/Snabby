import type { SessionId } from '../common/ids.ts';
import type { Timestamp } from '../common/timestamps.ts';

export interface ISessionProps {
  id: SessionId;
  name: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
