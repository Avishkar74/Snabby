import type { SessionId } from '../common/ids.ts';
import type { Timestamp } from '../common/timestamps.ts';
import { createSessionId } from '../common/ids.ts';
import { createTimestamp } from '../common/timestamps.ts';
import { ValidationError } from '../common/errors.ts';
import type { ISessionProps } from './session.types.ts';

export class Session implements ISessionProps {
  public readonly id: SessionId;
  public readonly name: string;
  public readonly createdAt: Timestamp;
  public readonly updatedAt: Timestamp;

  constructor(props: ISessionProps) {
    this.id = props.id;
    this.name = props.name;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.validate();
  }

  private validate(): void {
    if (!this.id) {
      throw new ValidationError('Session ID is required');
    }
    if (!this.name || !this.name.trim()) {
      throw new ValidationError('Session name cannot be empty or whitespace only');
    }
    if (this.createdAt <= 0) {
      throw new ValidationError('Session createdAt timestamp must be positive');
    }
    if (this.updatedAt < this.createdAt) {
      throw new ValidationError('Session updatedAt timestamp cannot be earlier than createdAt');
    }
  }

  public static create(name: string): Session {
    const now = createTimestamp();
    return new Session({
      id: createSessionId(),
      name: name,
      createdAt: now,
      updatedAt: now,
    });
  }

  public rename(newName: string): Session {
    return new Session({
      id: this.id,
      name: newName,
      createdAt: this.createdAt,
      updatedAt: createTimestamp(),
    });
  }
}
