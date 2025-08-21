import { BaseRepository, traceDbOperation } from '@enterprise/db';
import type { Role } from '@enterprise/types';

import { UserModel, type UserDocument } from '../models/user.model.js';

class UserRepository extends BaseRepository<UserDocument> {
  constructor() {
    super(UserModel);
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return traceDbOperation('findByEmail', 'users', async () => {
      return this.model.findOne({ email: email.toLowerCase() }).exec();
    });
  }

  async findByRole(role: Role): Promise<UserDocument[]> {
    return traceDbOperation('findByRole', 'users', async () => {
      return this.model.find({ roles: role }).exec();
    });
  }

  async updateRoles(userId: string, roles: Role[]): Promise<UserDocument | null> {
    return traceDbOperation('updateRoles', 'users', async () => {
      return this.model.findByIdAndUpdate(
        userId,
        { roles },
        { new: true }
      ).exec();
    });
  }

  async updateProfile(userId: string, profile: Record<string, unknown>): Promise<UserDocument | null> {
    return traceDbOperation('updateProfile', 'users', async () => {
      return this.model.findByIdAndUpdate(
        userId,
        { profile },
        { new: true }
      ).exec();
    });
  }
}

export const userRepository = new UserRepository();