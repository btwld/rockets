import { IQueryInfo } from 'accesscontrol';

import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';

import { AccessControlContext } from './access-control.context';
import {
  ACCESS_CONTROL_MODULE_QUERY_METADATA,
  ACCESS_CONTROL_MODULE_GRANT_METADATA,
  ACCESS_CONTROL_MODULE_SETTINGS_TOKEN,
} from './constants';
import { PossessionEnum } from './enums/possession.enum';
import { AccessControllerException } from './exceptions/access-controller.exception';
import { AccessControlGrantOptionInterface } from './interfaces/access-control-grant-option.interface';
import { AccessControlQueryOptionInterface } from './interfaces/access-control-query-option.interface';
import { AccessControlServiceInterface } from './interfaces/access-control-service.interface';
import { AccessControlSettingsInterface } from './interfaces/access-control-settings.interface';
import { CanAccess } from './interfaces/can-access.interface';
import { AccessControlService } from './services/access-control.service';

@Injectable()
export class AccessControlGuard implements CanActivate {
  constructor(
    @Inject(ACCESS_CONTROL_MODULE_SETTINGS_TOKEN)
    private readonly settings: AccessControlSettingsInterface,
    @Inject(AccessControlService)
    private readonly service: AccessControlServiceInterface,
    private readonly reflector: Reflector,
    private moduleRef: ModuleRef,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    // check permissions
    return this.checkAccessGrants(context);
  }

  protected async checkAccessGrants(
    context: ExecutionContext,
  ): Promise<boolean> {
    const rules = this.settings.rules;

    const acGrants = this.reflector.get<AccessControlGrantOptionInterface[]>(
      ACCESS_CONTROL_MODULE_GRANT_METADATA,
      context.getHandler(),
    );

    // get anything?
    if (!acGrants || !Array.isArray(acGrants)) {
      // no, nothing to check
      return true;
    }

    const userRoles = await this.service.getUserRoles(context);
    const possessions = [PossessionEnum.ANY, PossessionEnum.OWN];
    const queriesPermitted: IQueryInfo[] = [];

    // loop each grant
    loopGrants: for (const acGrant of acGrants) {
      // loop each possession
      for (const possession of possessions) {
        // build up the query
        const query: IQueryInfo = {
          role: userRoles,
          possession,
          ...acGrant,
        };
        // get permission object
        const permission = rules.permission(query);
        // has permission?
        if (permission.granted) {
          queriesPermitted.push(query);
          break loopGrants;
        }
      }
    }

    // any permitted queries?
    if (queriesPermitted.length) {
      // yes, check access queries
      return this.checkAccessQueries(context, queriesPermitted);
    }

    // no permissions via grants
    return false;
  }

  protected async checkAccessQueries(
    context: ExecutionContext,
    queriesPermitted: IQueryInfo[],
  ): Promise<boolean> {
    const targets = [context.getClass(), context.getHandler()];

    const acQueries = this.reflector.getAllAndMerge<
      AccessControlQueryOptionInterface[]
    >(
      ACCESS_CONTROL_MODULE_QUERY_METADATA,
      targets.filter((t) => t),
    );

    // get anything?
    if (!acQueries || !Array.isArray(acQueries) || !acQueries.length) {
      // no, nothing to check
      return true;
    }

    const request: unknown = context.switchToHttp().getRequest<unknown>();

    // did we get a request?
    if (!request || typeof request !== 'object') {
      // no, impossible to query
      return false;
    }

    const user = await this.service.getUser(context);

    // authorized by default
    let authorized = true;

    // loop all ac queries
    loopQueries: for await (const acQuery of acQueries) {
      // get the query service
      const service = await this.getQueryService(acQuery);

      // loop all queries permitted
      for await (const query of queriesPermitted) {
        // yes, new access control context instance
        const accessControlContext = new AccessControlContext({
          request,
          user,
          query,
          accessControl: this.settings.rules,
          executionContext: context,
        });

        // call query service
        authorized = await service.canAccess(accessControlContext);

        // lost access?
        if (authorized) {
          // yes, don't bother checking anything else
          break loopQueries;
        }
      }
    }

    return authorized;
  }

  private async getQueryService(
    queryOption: AccessControlQueryOptionInterface,
  ): Promise<CanAccess> {
    // get the query class instance
    const queryService = this.moduleRef.resolve(queryOption.service);

    if (queryService) {
      return queryService;
    } else {
      throw new AccessControllerException(
        `Access control guard was unable to resolve service ${queryOption.service.name}`,
      );
    }
  }
}
