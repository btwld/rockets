import { Controller } from '@nestjs/common';

import { ACCESS_CONTROL_MODULE_QUERY_METADATA } from '../constants';
import { AccessControlContextInterface } from '../interfaces/access-control-context.interface';
import { CanAccess } from '../interfaces/can-access.interface';

import { AccessControlQuery } from './access-control-query.decorator';

describe('@AccessControlQuery', () => {
  class TestQueryService implements CanAccess {
    async canAccess(_context: AccessControlContextInterface): Promise<boolean> {
      return true;
    }
  }

  @Controller()
  class TestController {
    @AccessControlQuery({
      service: TestQueryService,
    })
    createOne() {
      return null;
    }
  }

  const controller = new TestController();

  describe('enhance controller methods with access control query', () => {
    it('createOne should have query on metadata', () => {
      const grants = Reflect.getMetadata(
        ACCESS_CONTROL_MODULE_QUERY_METADATA,
        controller.createOne,
      );

      expect(grants).toEqual([
        {
          service: TestQueryService,
        },
      ]);
    });
  });
});
