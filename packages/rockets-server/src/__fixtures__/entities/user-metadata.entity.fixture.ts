import { BaseUserMetadataEntityInterface } from '../../domain/interfaces/user-metadata.interface';

/**
 * Example userMetadata entity fixture
 * This shows how clients can extend the base userMetadata entity
 * with their own custom fields
 */
export class UserMetadataEntityFixture
  implements BaseUserMetadataEntityInterface
{
  id: string;
  userId: string;
  dateCreated: Date;
  dateUpdated: Date;
  dateDeleted: Date | null;
  version: number;

  // Example custom fields that clients might add
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  avatar?: string;
  bio?: string;
  dateOfBirth?: Date;
  location?: string;
  website?: string;
  socialLinks?: Record<string, string>;
  preferences?: Record<string, unknown>;
  username?: string;

  constructor(data: Partial<UserMetadataEntityFixture> = {}) {
    this.id = data.id || `userMetadata-${Date.now()}`;
    this.userId = data.userId || `user-${Date.now()}`;
    this.dateCreated = data.dateCreated || new Date();
    this.dateUpdated = data.dateUpdated || new Date();
    this.dateDeleted = data.dateDeleted || null;
    this.version = data.version || 1;

    // Initialize custom fields from data
    const customData = data as Partial<UserMetadataEntityFixture> &
      Record<string, unknown>;
    this.firstName = customData.firstName;
    this.lastName = customData.lastName;
    this.email = customData.email;
    this.phone = customData.phone;
    this.avatar = customData.avatar;
    this.bio = customData.bio;
    this.dateOfBirth = customData.dateOfBirth;
    this.location = customData.location;
    this.website = customData.website;
    this.username = customData.username;
  }
}
