/**
 * Pet Appointment Resource Types
 * Used for access control configuration
 */
export const PetAppointmentResource = {
  One: 'pet-appointment',
  Many: 'pet-appointment',
} as const;

export type PetAppointmentResourceType =
  (typeof PetAppointmentResource)[keyof typeof PetAppointmentResource];
