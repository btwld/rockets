import { registerAs } from '@nestjs/config';

import { RocketsAuthSettingsInterface } from '../interfaces/rockets-auth-settings.interface';
import {
  ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN,
  ROCKETS_AUTH_OTP_ASSIGNMENT,
} from '../constants/rockets-auth.constants';

/**
 * Authentication combined configuration
 *
 * This combines all authentication-related configurations into a single namespace.
 */
export const rocketsAuthOptionsDefaultConfig = registerAs(
  ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN,
  (): RocketsAuthSettingsInterface => {
    return {
      role: {
        adminRoleName: process.env?.ADMIN_ROLE_NAME ?? 'admin',
        defaultUserRoleName: process.env?.DEFAULT_USER_ROLE_NAME ?? 'user',
      },
      email: {
        from: 'from',
        baseUrl: 'baseUrl',
        tokenUrlFormatter: (baseUrl: string, passcode: string) => {
          return `${baseUrl}/${passcode}`;
        },
        templates: {
          sendOtp: {
            fileName: __dirname + '/../assets/send-otp.template.hbs',
            subject: 'Your One Time Password',
          },
          invitation: {
            logo: '',
            fileName: __dirname + '/../assets/invitation.template.hbs',
            subject: 'You have been invited',
          },
          invitationAccepted: {
            logo: '',
            fileName: __dirname + '/../assets/invitation-accepted.template.hbs',
            subject: 'Invitation Accepted',
          },
        },
      },
      otp: {
        assignment: ROCKETS_AUTH_OTP_ASSIGNMENT,
        category: 'auth-login',
        type: 'uuid',
        expiresIn: '1h',
      },
    };
  },
);
