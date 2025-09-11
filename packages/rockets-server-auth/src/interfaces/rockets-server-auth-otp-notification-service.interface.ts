export interface RocketsServerAuthOtpNotificationServiceInterface {
  sendOtpEmail(params: { email: string; passcode: string }): Promise<void>;
}
