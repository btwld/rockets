# Rockets Server

![Rockets Logo](https://raw.githubusercontent.com/conceptadev/rockets/main/assets/rockets-icon.svg)

## Project

[![Codacy](https://app.codacy.com/project/badge/Grade/6b92bb0756ee4664a1403c4688a0d172)](https://www.codacy.com/gh/conceptadev/rockets/dashboard?utm_source=github.com&utm_medium=referral&utm_content=conceptadev/rockets&utm_campaign=Badge_Grade)
[![Code Climate Maint](https://img.shields.io/codeclimate/maintainability/conceptadev/rockets?logo=codeclimate)](https://codeclimate.com/github/conceptadev/rockets)
[![Code Climate Debt](https://img.shields.io/codeclimate/tech-debt/conceptadev/rockets?logo=codeclimate)](https://codeclimate.com/github/conceptadev/rockets)
[![Codecov](https://codecov.io/gh/conceptadev/rockets/branch/main/graph/badge.svg?token=QXUHV1RP5N)](https://codecov.io/gh/conceptadev/rockets)
[![GitHub Build](https://img.shields.io/github/actions/workflow/status/conceptadev/rockets/ci-pr-test.yml?logo=github)](https://github.com/conceptadev/rockets/actions/workflows/ci-pr-test.yml)
[![GH Commits](https://img.shields.io/github/commit-activity/m/conceptadev/rockets?logo=github)](https://github.com/conceptadev/rockets)
[![GH Last Commit](https://img.shields.io/github/last-commit/conceptadev/rockets?logo=github)](https://github.com/conceptadev/rockets)
[![GH Contrib](https://img.shields.io/github/contributors/conceptadev/rockets?logo=github)](https://github.com/conceptadev/rockets/graphs/contributors)

```text
Rapid Enterprise Development Toolkit
```

## Overview

**Rockets Server** is a comprehensive authentication and user management
solution for NestJS applications. It provides JWT authentication, user
management, OTP verification, email notifications, and API documentation
out of the box.

## 🚀 Quick Start

### Installation

```bash
npm install @concepta/rockets-server @concepta/nestjs-typeorm-ext typeorm
```

### Basic Setup

This is the minimum required setup to get started with Rockets Server. You'll need to create your entities and configure the module as follows:


```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { RocketsServerModule } from '@concepta/rockets-server';
import { TypeOrmExtModule } from '@concepta/nestjs-typeorm-ext';
import { UserEntity } from './entities/user.entity';
import { UserOtpEntity } from './entities/user-otp.entity';
import { FederatedEntity } from './entities/federated.entity';

@Module({
  imports: [
    TypeOrmExtModule.forRoot({
      type: 'sqlite',
      database: ':memory:',
      synchronize: true,
      autoLoadEntities: true,
    }),
    RocketsServerModule.forRoot({
      user: {
        imports: [
          TypeOrmExtModule.forFeature({
            user: {
              entity: UserFixture,
            },
          }),
        ],
      },
      otp: {
        imports: [
          TypeOrmExtModule.forFeature({
            userOtp: {
              entity: UserOtpEntityFixture,
            },
          }),
        ],
      },
      jwt: {
        settings: {
          default: { secret: 'test-secret-forroot' },
        },
      },
      services: {
        mailerService: mockEmailService,
      },
    }),
  ],
})
export class AppModule {}
```

That's it! You now have:

- Authentication endpoints (`/auth/login`, `/auth/signup`, etc.)
- User management (`/user`)
- OTP verification (`/otp`)
- API documentation (`/api`)

## 📖 Documentation

For detailed setup, configuration, and API reference, see:

**[📚 Complete Documentation](./packages/rockets-server/README.md)**

## 🔧 Dependencies

Rockets Server is built on top of the
[nestjs-modules](https://github.com/btwld/nestjs-modules) collection. Visit the
repository to explore individual modules for authentication, user management, email,
and more.

## 🤝 Contributing

This project is currently in alpha testing, however, feedback is highly appreciated
and encouraged!

Pull requests will be gratefully accepted in the very near future, once we have
finalized our Contributor License Agreement.

## 📄 License

This project is licensed under the MIT License - see the
[LICENSE.txt](LICENSE.txt) file for details.
