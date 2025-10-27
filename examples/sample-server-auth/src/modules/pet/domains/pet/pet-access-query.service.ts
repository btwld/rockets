import { Injectable, Inject, Logger } from '@nestjs/common';
import { AccessControlContextInterface, CanAccess } from '@concepta/nestjs-access-control';
import { PetModelService } from './pet-model.service';

@Injectable()
export class PetAccessQueryService implements CanAccess {
  private readonly logger = new Logger(PetAccessQueryService.name);

  constructor(
    @Inject(PetModelService)
    private readonly petModelService: PetModelService,
  ) {}
  
  async canAccess(context: AccessControlContextInterface): Promise<boolean> {
    const user = context.getUser() as { id: string };
    const query = context.getQuery();
    const request = context.getRequest() as { params?: { id?: string } };

    this.logger.debug(`[PetAccessQuery] Action: ${query.action}, Possession: ${query.possession}`);

    // If permission is 'any', allow (already validated by AccessControlGuard)
    if (query.possession === 'any') {
      this.logger.debug('[PetAccessQuery] Permission is "any" - access granted');
      return true;
    }

    // For 'own' possession, verify ownership
    if (query.possession === 'own') {
      // For create operations, automatically allow (user will be the owner)
      if (query.action === 'create') {
        this.logger.debug('[PetAccessQuery] Create action - access granted');
        return true;
      }

      // For read/update/delete, check ownership
      const petId = request.params?.id;
      
      if (petId) {
        // Single resource - check if pet belongs to user
        try {
          const pet = await this.petModelService.byId(petId);
          const isOwner = Boolean(pet && pet.userId === user.id);
          this.logger.debug(`[PetAccessQuery] Ownership check: Pet ${petId} ${isOwner ? 'belongs to' : 'does not belong to'} user ${user.id}`);
          return isOwner;
        } catch (error) {
          this.logger.error(`[PetAccessQuery] Error checking ownership: ${error}`);
          return false;
        }
      } else {
        // List operation - will be filtered by userId in the service
        this.logger.debug('[PetAccessQuery] List operation - access granted (will be filtered by userId)');
        return true;
      }
    }

    this.logger.debug('[PetAccessQuery] No matching condition - access denied');
    return false;
  }
}

