// =============================================================================
// MediCore API - FHIR R4 Interoperability Service
// =============================================================================

import argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../config/database';
import {
  ConsentRequiredError,
  NotFoundError,
  ValidationError,
} from '../../middleware/errorHandler';
import { consentService } from '../consent/consent.service';
import { fhirClient } from '../../integrations/fhir.client';
import { logger } from '../../utils/logger';

export type FhirResourceType = 'Patient' | 'Appointment' | 'Encounter' | 'Observation';

export interface FhirSyncLogInput {
  resourceType: string;
  localId: string;
  fhirId?: string | null;
  direction: 'IMPORT' | 'EXPORT';
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  errorMessage?: string | null;
  payload?: any;
}

export interface FhirSyncQuery {
  page?: number;
  limit?: number;
  resourceType?: string;
  direction?: 'IMPORT' | 'EXPORT';
  status?: 'PENDING' | 'SUCCESS' | 'FAILED';
  localId?: string;
}

const APPOINTMENT_STATUS_MAP: Record<string, string> = {
  REQUESTED: 'proposed',
  CONFIRMED: 'booked',
  CHECKED_IN: 'arrived',
  IN_PROGRESS: 'checked-in',
  COMPLETED: 'fulfilled',
  CANCELLED: 'cancelled',
  NO_SHOW: 'noshow',
};

const ENCOUNTER_STATUS_MAP: Record<string, string> = {
  IN_PROGRESS: 'in-progress',
  COMPLETED: 'finished',
  CANCELLED: 'cancelled',
  PLANNED: 'planned',
};

const GENDER_MAP: Record<string, 'male' | 'female' | 'other' | 'unknown'> = {
  MALE: 'male',
  M: 'male',
  FEMALE: 'female',
  F: 'female',
  OTHER: 'other',
  O: 'other',
  UNKNOWN: 'unknown',
  U: 'unknown',
};

export class FhirService {
  /**
   * Map a MediCore Patient (with user & optional contacts) to a FHIR R4 Patient resource
   */
  mapPatientToFhir(patient: any) {
    const telecom: Array<{ system: string; value: string; use?: string }> = [];
    if (patient.user?.phone) {
      telecom.push({ system: 'phone', value: patient.user.phone, use: 'mobile' });
    }
    if (patient.user?.email) {
      telecom.push({ system: 'email', value: patient.user.email, use: 'home' });
    }

    const addressEntries: Array<Record<string, any>> = [];
    if (patient.address || patient.city || patient.state || patient.postalCode || patient.country) {
      addressEntries.push({
        use: 'home',
        type: 'physical',
        line: patient.address ? [patient.address] : undefined,
        city: patient.city || undefined,
        state: patient.state || undefined,
        postalCode: patient.postalCode || undefined,
        country: patient.country || undefined,
      });
    }

    const normalizedGender =
      GENDER_MAP[(patient.gender || '').toUpperCase()] ?? 'unknown';

    const birthDate = patient.dateOfBirth
      ? new Date(patient.dateOfBirth).toISOString().split('T')[0]
      : undefined;

    const contacts = Array.isArray(patient.contacts)
      ? patient.contacts.map((c: any) => ({
          relationship: [
            {
              text: c.relationship || c.contactType,
            },
          ],
          name: {
            family: c.lastName,
            given: [c.firstName],
          },
          telecom: [
            ...(c.phone ? [{ system: 'phone', value: c.phone }] : []),
            ...(c.email ? [{ system: 'email', value: c.email }] : []),
          ],
        }))
      : undefined;

    return {
      resourceType: 'Patient',
      id: patient.id,
      meta: {
        lastUpdated: (patient.updatedAt ? new Date(patient.updatedAt) : new Date()).toISOString(),
        profile: ['http://hl7.org/fhir/StructureDefinition/Patient'],
      },
      identifier: [
        {
          use: 'official',
          system: 'urn:medicore:patient:registration',
          value: patient.registrationNumber,
        },
      ],
      active: patient.isActive ?? true,
      name: [
        {
          use: 'official',
          family: patient.user?.lastName || '',
          given: patient.user?.firstName ? [patient.user.firstName] : [],
        },
      ],
      ...(telecom.length > 0 ? { telecom } : {}),
      gender: normalizedGender,
      ...(birthDate ? { birthDate } : {}),
      ...(addressEntries.length > 0 ? { address: addressEntries } : {}),
      ...(contacts && contacts.length > 0 ? { contact: contacts } : {}),
    };
  }

  /**
   * Map a MediCore Appointment to a FHIR R4 Appointment resource
   */
  mapAppointmentToFhir(appointment: any) {
    const status = APPOINTMENT_STATUS_MAP[appointment.status] || 'pending';
    const patientName = appointment.patient?.user
      ? `${appointment.patient.user.firstName} ${appointment.patient.user.lastName}`.trim()
      : undefined;
    const doctorName = appointment.doctor?.user
      ? `Dr. ${appointment.doctor.user.firstName} ${appointment.doctor.user.lastName}`.trim()
      : undefined;

    return {
      resourceType: 'Appointment',
      id: appointment.id,
      meta: {
        lastUpdated: (appointment.updatedAt ? new Date(appointment.updatedAt) : new Date()).toISOString(),
        profile: ['http://hl7.org/fhir/StructureDefinition/Appointment'],
      },
      status,
      appointmentType: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v2-0276',
            code: appointment.type,
            display: appointment.type,
          },
        ],
      },
      ...(appointment.reason ? { description: appointment.reason } : {}),
      ...(appointment.notes ? { comment: appointment.notes } : {}),
      start: new Date(appointment.scheduledStart).toISOString(),
      end: new Date(appointment.scheduledEnd).toISOString(),
      priority: appointment.priority ?? 0,
      participant: [
        {
          actor: {
            reference: `Patient/${appointment.patientId}`,
            ...(patientName ? { display: patientName } : {}),
          },
          required: 'required',
          status: status === 'cancelled' ? 'declined' : 'accepted',
        },
        {
          actor: {
            reference: `Practitioner/${appointment.doctorId}`,
            ...(doctorName ? { display: doctorName } : {}),
          },
          required: 'required',
          status: status === 'cancelled' ? 'declined' : 'accepted',
        },
      ],
    };
  }

  /**
   * Map a MediCore Encounter to a FHIR R4 Encounter resource
   */
  mapEncounterToFhir(encounter: any) {
    const status = ENCOUNTER_STATUS_MAP[encounter.status] || 'unknown';
    const classCode =
      encounter.type === 'INPATIENT'
        ? 'IMP'
        : encounter.type === 'EMERGENCY'
          ? 'EMER'
          : 'AMB';

    const diagnoses = Array.isArray(encounter.diagnoses)
      ? encounter.diagnoses.map((d: any, index: number) => ({
          condition: {
            reference: `Condition/${d.id}`,
            display: `${d.code} - ${d.description}`,
          },
          use: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/diagnosis-role',
                code: d.type === 'PRIMARY' ? 'AD' : 'DD',
                display: d.type,
              },
            ],
          },
          rank: index + 1,
        }))
      : undefined;

    return {
      resourceType: 'Encounter',
      id: encounter.id,
      meta: {
        lastUpdated: (encounter.updatedAt ? new Date(encounter.updatedAt) : new Date()).toISOString(),
        profile: ['http://hl7.org/fhir/StructureDefinition/Encounter'],
      },
      status,
      class: {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: classCode,
        display: encounter.type,
      },
      subject: {
        reference: `Patient/${encounter.patientId}`,
      },
      participant: [
        {
          individual: {
            reference: `Practitioner/${encounter.doctorId}`,
            ...(encounter.doctor?.user
              ? {
                  display: `Dr. ${encounter.doctor.user.firstName} ${encounter.doctor.user.lastName}`.trim(),
                }
              : {}),
          },
        },
      ],
      ...(encounter.appointmentId
        ? { appointment: [{ reference: `Appointment/${encounter.appointmentId}` }] }
        : {}),
      period: {
        start: new Date(encounter.startedAt).toISOString(),
        ...(encounter.completedAt
          ? { end: new Date(encounter.completedAt).toISOString() }
          : {}),
      },
      ...(encounter.chiefComplaint
        ? { reasonCode: [{ text: encounter.chiefComplaint }] }
        : {}),
      ...(diagnoses && diagnoses.length > 0 ? { diagnosis: diagnoses } : {}),
    };
  }

  /**
   * Map a MediCore LabResult or VitalSign to a FHIR R4 Observation resource
   */
  mapObservationToFhir(observation: any) {
    // Detect LabResult vs VitalSign
    const isLabResult =
      observation.labOrderItemId !== undefined || observation.labOrderItem !== undefined;

    if (isLabResult) {
      const test = observation.labOrderItem?.test;
      const patientId = observation.labOrderItem?.labOrder?.patientId;
      const encounterId = observation.labOrderItem?.labOrder?.encounterId;

      return {
        resourceType: 'Observation',
        id: observation.id,
        meta: {
          lastUpdated: (observation.updatedAt ? new Date(observation.updatedAt) : new Date()).toISOString(),
          profile: ['http://hl7.org/fhir/StructureDefinition/Observation'],
        },
        status: observation.validatedAt ? 'final' : 'preliminary',
        category: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                code: 'laboratory',
                display: 'Laboratory',
              },
            ],
          },
        ],
        code: {
          coding: [
            {
              system: 'urn:medicore:lab-test',
              code: test?.code || observation.labOrderItemId,
              display: test?.name || 'Laboratory Result',
            },
          ],
          text: test?.name || 'Laboratory Result',
        },
        ...(patientId ? { subject: { reference: `Patient/${patientId}` } } : {}),
        ...(encounterId ? { encounter: { reference: `Encounter/${encounterId}` } } : {}),
        effectiveDateTime: new Date(observation.resultedAt || observation.createdAt).toISOString(),
        ...(observation.numericValue !== null && observation.numericValue !== undefined
          ? {
              valueQuantity: {
                value: observation.numericValue,
                unit: observation.unit || test?.unit || '',
                system: 'http://unitsofmeasure.org',
              },
            }
          : { valueString: String(observation.value ?? '') }),
        ...(observation.referenceRange
          ? { referenceRange: [{ text: observation.referenceRange }] }
          : {}),
        ...(observation.abnormalFlag
          ? {
              interpretation: [
                {
                  coding: [
                    {
                      system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
                      code: observation.abnormalFlag,
                      display: observation.abnormalFlag,
                    },
                  ],
                },
              ],
            }
          : {}),
        ...(observation.notes ? { note: [{ text: observation.notes }] } : {}),
      };
    }

    // VitalSign mapping to FHIR Observation with vital-signs category & components
    const components: Array<Record<string, any>> = [];
    const vitalReadings: Array<{ field: string; code: string; display: string; unit: string }> = [
      { field: 'temperature', code: '8310-5', display: 'Body temperature', unit: 'Cel' },
      { field: 'bloodPressureSystolic', code: '8480-6', display: 'Systolic blood pressure', unit: 'mm[Hg]' },
      { field: 'bloodPressureDiastolic', code: '8462-4', display: 'Diastolic blood pressure', unit: 'mm[Hg]' },
      { field: 'heartRate', code: '8867-4', display: 'Heart rate', unit: '/min' },
      { field: 'respiratoryRate', code: '9279-1', display: 'Respiratory rate', unit: '/min' },
      { field: 'oxygenSaturation', code: '2708-6', display: 'Oxygen saturation', unit: '%' },
      { field: 'weight', code: '29463-7', display: 'Body weight', unit: 'kg' },
      { field: 'height', code: '8302-2', display: 'Body height', unit: 'cm' },
      { field: 'bmi', code: '39156-5', display: 'Body mass index', unit: 'kg/m2' },
    ];

    for (const vital of vitalReadings) {
      const value = observation[vital.field];
      if (value !== null && value !== undefined) {
        components.push({
          code: {
            coding: [
              {
                system: 'http://loinc.org',
                code: vital.code,
                display: vital.display,
              },
            ],
          },
          valueQuantity: {
            value,
            unit: vital.unit,
            system: 'http://unitsofmeasure.org',
          },
        });
      }
    }

    return {
      resourceType: 'Observation',
      id: observation.id,
      meta: {
        lastUpdated: new Date(observation.recordedAt || observation.createdAt).toISOString(),
        profile: ['http://hl7.org/fhir/StructureDefinition/vitalsigns'],
      },
      status: 'final',
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
              code: 'vital-signs',
              display: 'Vital Signs',
            },
          ],
        },
      ],
      code: {
        coding: [
          {
            system: 'http://loinc.org',
            code: '85353-1',
            display: 'Vital signs, weight, height, head circumference, oxygen saturation and BMI panel',
          },
        ],
        text: 'Vital Signs',
      },
      ...(observation.encounter?.patientId
        ? { subject: { reference: `Patient/${observation.encounter.patientId}` } }
        : {}),
      ...(observation.encounterId
        ? { encounter: { reference: `Encounter/${observation.encounterId}` } }
        : {}),
      effectiveDateTime: new Date(observation.recordedAt || observation.createdAt).toISOString(),
      ...(components.length > 0 ? { component: components } : {}),
      ...(observation.notes ? { note: [{ text: observation.notes }] } : {}),
    };
  }

  /**
   * Export a local resource to FHIR R4 format and record a FhirSyncRecord.
   * Enforces patient DATA_SHARING consent before external interoperability export.
   */
  async exportResource(type: FhirResourceType, localId: string, options?: { skipConsentCheck?: boolean }) {
    try {
      let fhirResource: Record<string, any>;
      let patientIdForConsent: string | null = null;

      switch (type) {
        case 'Patient': {
          const patient = await prisma.patient.findUnique({
            where: { id: localId },
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                  phone: true,
                },
              },
              contacts: true,
            },
          });

          if (!patient) {
            throw new NotFoundError('Patient not found');
          }

          patientIdForConsent = patient.id;
          fhirResource = this.mapPatientToFhir(patient);
          break;
        }

        case 'Appointment': {
          const appointment = await prisma.appointment.findUnique({
            where: { id: localId },
            include: {
              patient: {
                include: {
                  user: { select: { firstName: true, lastName: true } },
                },
              },
              doctor: {
                include: {
                  user: { select: { firstName: true, lastName: true } },
                },
              },
            },
          });

          if (!appointment) {
            throw new NotFoundError('Appointment not found');
          }

          patientIdForConsent = appointment.patientId;
          fhirResource = this.mapAppointmentToFhir(appointment);
          break;
        }

        case 'Encounter': {
          const encounter = await prisma.encounter.findUnique({
            where: { id: localId },
            include: {
              patient: {
                include: {
                  user: { select: { firstName: true, lastName: true } },
                },
              },
              doctor: {
                include: {
                  user: { select: { firstName: true, lastName: true } },
                },
              },
              diagnoses: true,
            },
          });

          if (!encounter) {
            throw new NotFoundError('Encounter not found');
          }

          patientIdForConsent = encounter.patientId;
          fhirResource = this.mapEncounterToFhir(encounter);
          break;
        }

        case 'Observation': {
          const labResult = await prisma.labResult.findUnique({
            where: { id: localId },
            include: {
              labOrderItem: {
                include: {
                  test: true,
                  labOrder: true,
                },
              },
            },
          });

          if (labResult) {
            patientIdForConsent = labResult.labOrderItem?.labOrder?.patientId ?? null;
            fhirResource = this.mapObservationToFhir(labResult);
          } else {
            const vitalSign = await prisma.vitalSign.findUnique({
              where: { id: localId },
              include: {
                encounter: { select: { id: true, patientId: true } },
              },
            });

            if (!vitalSign) {
              throw new NotFoundError('Observation (LabResult or VitalSign) not found');
            }

            patientIdForConsent = vitalSign.encounter?.patientId ?? null;
            fhirResource = this.mapObservationToFhir(vitalSign);
          }
          break;
        }

        default:
          throw new ValidationError(`Unsupported FHIR resource type: ${type}`);
      }

      if (patientIdForConsent && !options?.skipConsentCheck) {
        const hasConsent = await consentService.checkConsent(patientIdForConsent, 'DATA_SHARING');
        if (!hasConsent) {
          throw new ConsentRequiredError(
            'Active DATA_SHARING consent is required to export this patient resource via FHIR'
          );
        }
      }

      const transmitResult = await fhirClient.pushResource(
        type,
        fhirResource,
        `fhir-export-${type}-${localId}`
      );

      const syncRecord = await this.recordSync({
        resourceType: type,
        localId,
        fhirId: transmitResult.remoteId || fhirResource.id,
        direction: 'EXPORT',
        status: 'SUCCESS',
        payload: fhirResource,
      });

      return {
        resource: fhirResource,
        syncRecord,
        transmitMode: transmitResult.mode,
      };
    } catch (error) {
      await this.recordSync({
        resourceType: type,
        localId,
        direction: 'EXPORT',
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : 'Export failed',
      });
      throw error;
    }
  }

  /**
   * Import a FHIR R4 resource into MediCore and record a FhirSyncRecord
   */
  async importResource(type: FhirResourceType, fhirResource: any) {
    if (!fhirResource || typeof fhirResource !== 'object') {
      throw new ValidationError('Invalid FHIR resource payload');
    }

    if (fhirResource.resourceType && fhirResource.resourceType !== type) {
      throw new ValidationError(
        `Expected FHIR resourceType "${type}", received "${fhirResource.resourceType}"`
      );
    }

    const fhirId = typeof fhirResource.id === 'string' ? fhirResource.id : null;

    try {
      if (type !== 'Patient') {
        throw new ValidationError(`FHIR import is currently only supported for Patient resources`);
      }

      const primaryName = Array.isArray(fhirResource.name) ? fhirResource.name[0] : null;
      const firstName =
        (Array.isArray(primaryName?.given) ? primaryName.given[0] : undefined) || '';
      const lastName = primaryName?.family || '';

      if (!firstName || !lastName) {
        throw new ValidationError('FHIR Patient resource must include name.family and name.given');
      }

      const telecomList = Array.isArray(fhirResource.telecom) ? fhirResource.telecom : [];
      const emailEntry = telecomList.find((t: any) => t.system === 'email');
      const phoneEntry = telecomList.find((t: any) => t.system === 'phone');

      const identifierList = Array.isArray(fhirResource.identifier)
        ? fhirResource.identifier
        : [];
      const officialIdentifier = identifierList.find((i: any) => i.value)?.value;

      const primaryAddress = Array.isArray(fhirResource.address)
        ? fhirResource.address[0]
        : null;
      const addressLine = Array.isArray(primaryAddress?.line)
        ? primaryAddress.line.join(', ')
        : undefined;

      const gender = (fhirResource.gender || 'UNKNOWN').toUpperCase();
      const dateOfBirth = fhirResource.birthDate
        ? new Date(fhirResource.birthDate)
        : new Date('1970-01-01');

      if (Number.isNaN(dateOfBirth.getTime())) {
        throw new ValidationError('Invalid birthDate in FHIR Patient resource');
      }

      const registrationNumber =
        officialIdentifier ||
        `FHIR-${uuidv4().slice(0, 8).toUpperCase()}`;

      const email =
        emailEntry?.value?.toLowerCase() ||
        `${registrationNumber.toLowerCase().replace(/[^a-z0-9]/g, '')}@fhir-import.local`;

      const existingPatient = await prisma.patient.findFirst({
        where: {
          OR: [
            ...(fhirId ? [{ id: fhirId }] : []),
            { registrationNumber },
            { user: { email } },
          ],
        },
        include: { user: true },
      });

      let savedPatient: any;

      if (existingPatient) {
        savedPatient = await prisma.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: existingPatient.userId },
            data: {
              firstName,
              lastName,
              ...(phoneEntry?.value ? { phone: phoneEntry.value } : {}),
            },
          });

          return tx.patient.update({
            where: { id: existingPatient.id },
            data: {
              gender,
              dateOfBirth,
              address: addressLine ?? existingPatient.address,
              city: primaryAddress?.city ?? existingPatient.city,
              state: primaryAddress?.state ?? existingPatient.state,
              postalCode: primaryAddress?.postalCode ?? existingPatient.postalCode,
              country: primaryAddress?.country ?? existingPatient.country,
              isActive: fhirResource.active ?? existingPatient.isActive,
            },
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                  phone: true,
                },
              },
              contacts: true,
            },
          });
        });
      } else {
        const passwordHash = await argon2.hash(uuidv4(), {
          type: argon2.argon2id,
        });

        let patientRole = await prisma.role.findUnique({ where: { name: 'PATIENT' } });
        if (!patientRole) {
          patientRole = await prisma.role.create({
            data: { name: 'PATIENT', description: 'PATIENT role', isSystem: true },
          });
        }

        savedPatient = await prisma.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              email,
              passwordHash,
              firstName,
              lastName,
              phone: phoneEntry?.value || null,
            },
          });

          await tx.userRole.create({
            data: {
              userId: user.id,
              roleId: patientRole!.id,
            },
          });

          return tx.patient.create({
            data: {
              userId: user.id,
              registrationNumber,
              dateOfBirth,
              gender,
              address: addressLine || null,
              city: primaryAddress?.city || null,
              state: primaryAddress?.state || null,
              postalCode: primaryAddress?.postalCode || null,
              country: primaryAddress?.country || null,
              isActive: fhirResource.active ?? true,
            },
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                  phone: true,
                },
              },
              contacts: true,
            },
          });
        });
      }

      const syncRecord = await this.recordSync({
        resourceType: type,
        localId: savedPatient.id,
        fhirId: fhirId || savedPatient.id,
        direction: 'IMPORT',
        status: 'SUCCESS',
        payload: fhirResource,
      });

      return {
        patient: savedPatient,
        syncRecord,
      };
    } catch (error) {
      await this.recordSync({
        resourceType: type,
        localId: fhirId || 'UNKNOWN',
        fhirId,
        direction: 'IMPORT',
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : 'Import failed',
        payload: fhirResource,
      });
      throw error;
    }
  }

  /**
   * Persist a FhirSyncRecord log entry (never fails the caller on logging error)
   */
  async recordSync(input: FhirSyncLogInput) {
    try {
      return await prisma.fhirSyncRecord.create({
        data: {
          resourceType: input.resourceType,
          localId: input.localId,
          fhirId: input.fhirId ?? null,
          direction: input.direction,
          status: input.status,
          errorMessage: input.errorMessage ?? null,
          payload: input.payload ?? undefined,
          syncedAt: input.status === 'SUCCESS' ? new Date() : null,
        },
      });
    } catch (error) {
      logger.error({ error, input }, 'Failed to record FHIR sync log');
      return null;
    }
  }

  /**
   * Retrieve paginated FHIR sync records
   */
  async getSyncRecords(query: FhirSyncQuery = {}) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, any> = {};
    if (query.resourceType) where.resourceType = query.resourceType;
    if (query.direction) where.direction = query.direction;
    if (query.status) where.status = query.status;
    if (query.localId) where.localId = query.localId;

    const [records, total] = await Promise.all([
      prisma.fhirSyncRecord.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.fhirSyncRecord.count({ where }),
    ]);

    return {
      records,
      total,
      page,
      limit,
    };
  }
}

export const fhirService = new FhirService();
