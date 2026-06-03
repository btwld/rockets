import { IQueryInfo } from 'accesscontrol';
import { map } from 'rxjs/operators';

import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import {
  ACCESS_CONTROL_MODULE_GRANT_METADATA,
  ACCESS_CONTROL_MODULE_SETTINGS_TOKEN,
} from '../constants';
import { PossessionEnum } from '../enums/possession.enum';
import { AccessControlGrantOptionInterface } from '../interfaces/access-control-grant-option.interface';
import { AccessControlServiceInterface } from '../interfaces/access-control-service.interface';
import { AccessControlSettingsInterface } from '../interfaces/access-control-settings.interface';
import { AccessControlService } from '../services/access-control.service';

@Injectable()
export class AccessControlFilter implements NestInterceptor {
  constructor(
    @Inject(ACCESS_CONTROL_MODULE_SETTINGS_TOKEN)
    private readonly settings: AccessControlSettingsInterface,
    @Inject(AccessControlService)
    private readonly service: AccessControlServiceInterface,
    private readonly reflector: Reflector,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler) {
    // get my method and its metadata
    const acGrants = this.reflector.get<AccessControlGrantOptionInterface[]>(
      ACCESS_CONTROL_MODULE_GRANT_METADATA,
      context.getHandler(),
    );

    if (!acGrants || !Array.isArray(acGrants)) {
      return next.handle();
    }
    // get roles of my user, they will be used to see if they have access
    // and how attribute filter should be applied
    const userRoles = await this.service.getUserRoles(context);

    // today, we can define what permission, so lets check for both
    return next.handle().pipe(
      map((data) => {
        for (const grant of acGrants) {
          // filter based on any
          let permission = this.getPermission(
            userRoles,
            grant,
            PossessionEnum.ANY,
          );
          if (permission.granted && permission.attributes)
            return permission.filter(data);

          // filter based on own
          permission = this.getPermission(userRoles, grant, PossessionEnum.OWN);
          if (permission.granted && permission.attributes)
            return permission.filter(data);

          // if none just return data
          return data;
        }
      }),
    );
  }

  private getPermission(
    userRoles: string | string[],
    grant: AccessControlGrantOptionInterface,
    possession: PossessionEnum,
  ) {
    const rules = this.settings.rules;
    const query: IQueryInfo = {
      role: userRoles,
      action: grant.action,
      resource: grant.resource,
      possession,
    };
    // get permission object
    return rules.permission(query);
  }
}
