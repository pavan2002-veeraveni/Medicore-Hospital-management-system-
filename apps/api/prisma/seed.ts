// =============================================================================
// MediCore API - Database Seed Script
// Synthetic data only - educational purposes
// =============================================================================

import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding MediCore database...');

  // 1. Roles
  const roleNames = [
    { name: 'PATIENT', description: 'Patient user' },
    { name: 'RECEPTIONIST', description: 'Front desk receptionist' },
    { name: 'DOCTOR', description: 'Medical doctor' },
    { name: 'NURSE', description: 'Registered nurse' },
    { name: 'LAB_TECHNICIAN', description: 'Laboratory technician' },
    { name: 'BILLING_OFFICER', description: 'Billing and finance officer' },
    { name: 'HOSPITAL_ADMIN', description: 'Hospital administrator' },
  ];

  const roles = await Promise.all(
    roleNames.map((r) =>
      prisma.role.upsert({
        where: { name: r.name },
        update: {},
        create: { name: r.name, description: r.description, isSystem: true },
      })
    )
  );
  console.log(`  ✅ ${roles.length} roles ready`);
  const roleMap = Object.fromEntries(roles.map((r) => [r.name, r.id]));

  // 2. Departments
  const deptDefs = [
    { name: 'Cardiology', code: 'CARD', description: 'Heart and cardiovascular system' },
    { name: 'Orthopedics', code: 'ORTH', description: 'Bones, joints, and muscles' },
    { name: 'General Medicine', code: 'GENM', description: 'General internal medicine' },
    { name: 'Pediatrics', code: 'PEDI', description: 'Children and adolescent care' },
    { name: 'Dermatology', code: 'DERM', description: 'Skin conditions and treatments' },
    { name: 'Neurology', code: 'NEUR', description: 'Nervous system disorders' },
    { name: 'Laboratory', code: 'LABO', description: 'Clinical laboratory services' },
    { name: 'Emergency', code: 'EMER', description: 'Emergency medical services' },
  ];

  const departments = await Promise.all(
    deptDefs.map((d) =>
      prisma.department.upsert({ where: { code: d.code }, update: {}, create: d })
    )
  );
  console.log(`  ✅ ${departments.length} departments ready`);
  const deptMap = Object.fromEntries(departments.map((d) => [d.code, d.id]));

  // 3. Users (synthetic test accounts)
  const password = await argon2.hash('Password123!', {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const userDefs = [
    { email: 'admin@medicore.local', firstName: 'Sarah', lastName: 'Admin', role: 'HOSPITAL_ADMIN', empId: 'EMP-10001', dept: 'GENM' },
    { email: 'doctor.smith@medicore.local', firstName: 'John', lastName: 'Smith', role: 'DOCTOR', empId: 'EMP-10002', dept: 'CARD', spec: 'Cardiologist' },
    { email: 'doctor.jones@medicore.local', firstName: 'Emily', lastName: 'Jones', role: 'DOCTOR', empId: 'EMP-10003', dept: 'GENM', spec: 'General Practitioner' },
    { email: 'doctor.patel@medicore.local', firstName: 'Raj', lastName: 'Patel', role: 'DOCTOR', empId: 'EMP-10004', dept: 'ORTH', spec: 'Orthopedic Surgeon' },
    { email: 'nurse.williams@medicore.local', firstName: 'Mary', lastName: 'Williams', role: 'NURSE', empId: 'EMP-10005', dept: 'GENM' },
    { email: 'nurse.chen@medicore.local', firstName: 'Lisa', lastName: 'Chen', role: 'NURSE', empId: 'EMP-10006', dept: 'CARD' },
    { email: 'reception@medicore.local', firstName: 'David', lastName: 'Brown', role: 'RECEPTIONIST', empId: 'EMP-10007', dept: 'GENM' },
    { email: 'lab@medicore.local', firstName: 'James', lastName: 'Wilson', role: 'LAB_TECHNICIAN', empId: 'EMP-10008', dept: 'LABO' },
    { email: 'billing@medicore.local', firstName: 'Karen', lastName: 'Taylor', role: 'BILLING_OFFICER', empId: 'EMP-10009', dept: 'GENM' },
    { email: 'patient1@medicore.local', firstName: 'Alice', lastName: 'Johnson', role: 'PATIENT', regNum: 'MED-000001', dob: '1988-04-12', gender: 'FEMALE', bloodType: 'O+' },
    { email: 'patient2@medicore.local', firstName: 'Bob', lastName: 'Davis', role: 'PATIENT', regNum: 'MED-000002', dob: '1979-09-23', gender: 'MALE', bloodType: 'A+' },
    { email: 'patient3@medicore.local', firstName: 'Carol', lastName: 'Martinez', role: 'PATIENT', regNum: 'MED-000003', dob: '1994-11-05', gender: 'FEMALE', bloodType: 'B+' },
  ];

  const createdPatients: any[] = [];
  const createdDoctors: any[] = [];

  for (const u of userDefs) {
    let user = await prisma.user.findUnique({ where: { email: u.email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: u.email,
          passwordHash: password,
          firstName: u.firstName,
          lastName: u.lastName,
          phone: '+1-555-0100',
          emailVerified: true,
        },
      });

      await prisma.userRole.create({
        data: { userId: user.id, roleId: roleMap[u.role] },
      });
    }

    if (u.role !== 'PATIENT' && u.dept && u.empId) {
      let staff = await prisma.staff.findUnique({ where: { userId: user.id } });
      if (!staff) {
        staff = await prisma.staff.create({
          data: {
            userId: user.id,
            employeeId: u.empId,
            departmentId: deptMap[u.dept],
            specialization: u.spec || null,
            qualification: u.role === 'DOCTOR' ? 'MBBS, MD' : u.role === 'NURSE' ? 'BSN, RN' : 'B.Sc.',
            joiningDate: new Date('2023-01-15'),
          },
        });
      }

      if (u.role === 'DOCTOR') {
        createdDoctors.push(staff);
        const schedCount = await prisma.doctorSchedule.count({ where: { staffId: staff.id } });
        if (schedCount === 0) {
          for (let day = 0; day <= 6; day++) {
            await prisma.doctorSchedule.create({
              data: {
                staffId: staff.id,
                dayOfWeek: day,
                startTime: '08:00',
                endTime: '18:00',
                slotDuration: 30,
                validFrom: new Date('2024-01-01'),
              },
            });
          }
        }
      }
    }

    if (u.role === 'PATIENT') {
      let patient = await prisma.patient.findUnique({ where: { userId: user.id } });
      if (!patient) {
        patient = await prisma.patient.create({
          data: {
            userId: user.id,
            registrationNumber: u.regNum!,
            dateOfBirth: new Date(u.dob!),
            gender: u.gender!,
            bloodType: u.bloodType!,
            address: '123 Synthetic Ave',
            city: 'Springfield',
            state: 'IL',
            postalCode: '62704',
            country: 'US',
          },
        });

        await prisma.consent.create({
          data: {
            patientId: patient.id,
            category: 'TREATMENT',
            purpose: 'General outpatient care and treatment',
            status: 'GRANTED',
          },
        });

        await prisma.consent.create({
          data: {
            patientId: patient.id,
            category: 'DATA_SHARING',
            purpose: 'FHIR interoperability data exchange',
            status: 'GRANTED',
          },
        });
      }
      createdPatients.push(patient);
    }
  }
  console.log(`  ✅ ${userDefs.length} users, staff, schedules, patients & consents ready`);

  // 4. Medication Catalog
  const medications = [
    { name: 'Amoxicillin 500mg', genericName: 'Amoxicillin', category: 'Antibiotic', form: 'CAPSULE', strength: '500mg' },
    { name: 'Metformin 500mg', genericName: 'Metformin', category: 'Antidiabetic', form: 'TABLET', strength: '500mg' },
    { name: 'Lisinopril 10mg', genericName: 'Lisinopril', category: 'Antihypertensive', form: 'TABLET', strength: '10mg' },
    { name: 'Omeprazole 20mg', genericName: 'Omeprazole', category: 'Proton Pump Inhibitor', form: 'CAPSULE', strength: '20mg' },
    { name: 'Atorvastatin 20mg', genericName: 'Atorvastatin', category: 'Statin', form: 'TABLET', strength: '20mg' },
    { name: 'Ibuprofen 400mg', genericName: 'Ibuprofen', category: 'NSAID', form: 'TABLET', strength: '400mg' },
    { name: 'Paracetamol 500mg', genericName: 'Acetaminophen', category: 'Analgesic', form: 'TABLET', strength: '500mg' },
    { name: 'Cetirizine 10mg', genericName: 'Cetirizine', category: 'Antihistamine', form: 'TABLET', strength: '10mg' },
    { name: 'Azithromycin 250mg', genericName: 'Azithromycin', category: 'Antibiotic', form: 'TABLET', strength: '250mg' },
    { name: 'Salbutamol Inhaler', genericName: 'Salbutamol', category: 'Bronchodilator', form: 'INHALER', strength: '100mcg' },
  ];

  const createdMeds: any[] = [];
  for (const med of medications) {
    let existing = await prisma.medicationCatalog.findFirst({ where: { name: med.name } });
    if (!existing) {
      existing = await prisma.medicationCatalog.create({ data: med });
    }
    createdMeds.push(existing);
  }
  console.log(`  ✅ ${medications.length} medications ready`);

  // 5. Laboratory Tests
  const labTests = [
    { name: 'Complete Blood Count', code: 'CBC', category: 'Hematology', unit: 'cells/μL', referenceMin: 4500, referenceMax: 11000, sampleType: 'BLOOD', turnaroundHours: 4, price: 25 },
    { name: 'Blood Glucose Fasting', code: 'GLU-F', category: 'Biochemistry', unit: 'mg/dL', referenceMin: 70, referenceMax: 100, sampleType: 'BLOOD', turnaroundHours: 2, price: 15 },
    { name: 'Hemoglobin A1c', code: 'HBA1C', category: 'Biochemistry', unit: '%', referenceMin: 4.0, referenceMax: 5.6, sampleType: 'BLOOD', turnaroundHours: 6, price: 35 },
    { name: 'Lipid Panel', code: 'LIPID', category: 'Biochemistry', unit: 'mg/dL', referenceMin: 0, referenceMax: 200, sampleType: 'BLOOD', turnaroundHours: 6, price: 40 },
    { name: 'Thyroid Stimulating Hormone', code: 'TSH', category: 'Immunology', unit: 'mIU/mL', referenceMin: 0.4, referenceMax: 4.0, sampleType: 'BLOOD', turnaroundHours: 12, price: 45 },
    { name: 'Urinalysis', code: 'UA', category: 'Urinalysis', unit: '', sampleType: 'URINE', turnaroundHours: 2, price: 20 },
    { name: 'Liver Function Test', code: 'LFT', category: 'Biochemistry', unit: 'U/L', referenceMin: 7, referenceMax: 56, sampleType: 'BLOOD', turnaroundHours: 6, price: 50 },
    { name: 'Kidney Function Test', code: 'KFT', category: 'Biochemistry', unit: 'mg/dL', referenceMin: 0.6, referenceMax: 1.2, sampleType: 'BLOOD', turnaroundHours: 6, price: 50 },
  ];

  const createdTests: any[] = [];
  for (const test of labTests) {
    const t = await prisma.laboratoryTest.upsert({ where: { code: test.code }, update: {}, create: test });
    createdTests.push(t);
  }
  console.log(`  ✅ ${labTests.length} laboratory tests ready`);

  // 6. Sample Appointments, Encounters, Prescriptions, Lab Orders, Invoices (idempotent)
  const existingAppts = await prisma.appointment.count();
  if (existingAppts === 0 && createdPatients.length >= 2 && createdDoctors.length >= 2) {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(10, 0, 0, 0);

    const appt1 = await prisma.appointment.create({
      data: {
        patientId: createdPatients[0].id,
        doctorId: createdDoctors[0].id,
        departmentId: createdDoctors[0].departmentId,
        scheduledStart: tomorrow,
        scheduledEnd: new Date(tomorrow.getTime() + 30 * 60000),
        status: 'CONFIRMED',
        type: 'CONSULTATION',
        reason: 'Routine cardiac follow-up',
      },
    });

    const slot2 = new Date(tomorrow.getTime() + 60 * 60000);
    await prisma.appointment.create({
      data: {
        patientId: createdPatients[1].id,
        doctorId: createdDoctors[1].id,
        departmentId: createdDoctors[1].departmentId,
        scheduledStart: slot2,
        scheduledEnd: new Date(slot2.getTime() + 30 * 60000),
        status: 'REQUESTED',
        type: 'FOLLOW_UP',
        reason: 'Annual wellness visit',
      },
    });

    const encounter = await prisma.encounter.create({
      data: {
        patientId: createdPatients[0].id,
        doctorId: createdDoctors[0].id,
        appointmentId: appt1.id,
        status: 'IN_PROGRESS',
        type: 'OUTPATIENT',
        chiefComplaint: 'Mild blood pressure check',
        clinicalNotes: 'Synthetic demonstration clinical note.',
      },
    });

    await prisma.vitalSign.create({
      data: {
        encounterId: encounter.id,
        temperature: 36.8,
        bloodPressureSystolic: 122,
        bloodPressureDiastolic: 78,
        heartRate: 72,
        respiratoryRate: 16,
        oxygenSaturation: 99,
        weight: 68,
        height: 168,
        bmi: 24.09,
        recordedBy: createdDoctors[0].userId,
      },
    });

    await prisma.prescription.create({
      data: {
        encounterId: encounter.id,
        patientId: createdPatients[0].id,
        prescriberId: createdDoctors[0].id,
        status: 'ACTIVE',
        notes: 'Synthetic demonstration prescription',
        items: {
          create: [
            {
              medicationId: createdMeds[2].id,
              dosage: '10mg',
              frequency: 'Once daily',
              duration: '30 days',
              route: 'ORAL',
              quantity: 30,
            },
          ],
        },
      },
    });

    await prisma.labOrder.create({
      data: {
        patientId: createdPatients[0].id,
        encounterId: encounter.id,
        orderedBy: createdDoctors[0].userId,
        status: 'ORDERED',
        priority: 'ROUTINE',
        clinicalNotes: 'Routine synthetic blood panel',
        items: {
          create: [{ testId: createdTests[0].id, status: 'PENDING' }],
        },
      },
    });

    await prisma.invoice.create({
      data: {
        patientId: createdPatients[0].id,
        invoiceNumber: 'INV-20261126-0001',
        status: 'ISSUED',
        subtotal: 175,
        taxRate: 0,
        taxAmount: 0,
        discountAmount: 0,
        totalAmount: 175,
        paidAmount: 0,
        issuedAt: new Date(),
        items: {
          create: [
            { description: 'Cardiology Consultation', category: 'CONSULTATION', quantity: 1, unitPrice: 150, totalPrice: 150 },
            { description: 'Complete Blood Count (CBC)', category: 'LAB_TEST', quantity: 1, unitPrice: 25, totalPrice: 25 },
          ],
        },
      },
    });
    console.log('  ✅ Sample appointments, encounter, vitals, prescription, lab order & invoice seeded');
  }

  console.log('\n🎉 Database seeded successfully!');
}

main()
  .catch((e) => { console.error('Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
