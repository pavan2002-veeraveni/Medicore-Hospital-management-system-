// =============================================================================
// MediCore API - Swagger/OpenAPI Configuration
// =============================================================================

import { Express } from 'express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'MediCore Hospital Management API',
      version: '1.0.0',
      description: `
        MediCore is a comprehensive Hospital, Appointment & Patient Care Management Platform.
        
        This API provides endpoints for:
        - Authentication & User Management
        - Patient Registration & Management
        - Staff & Department Management
        - Appointment Scheduling & Workflow
        - Clinical Encounters & Diagnoses
        - Prescription Management
        - Laboratory Management
        - Billing & Payments
        - Consent Management
        - Audit Logging
        - Notifications
        - FHIR R4 Interoperability
        
        **IMPORTANT**: This is an educational healthcare engineering project using synthetic data only.
        It does not claim legal, medical, or regulatory compliance certification.
      `,
      contact: {
        name: 'MediCore Team',
      },
      license: {
        name: 'MIT',
      },
    },
    servers: [
      {
        url: 'http://localhost:4000',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT access token',
        },
      },
      schemas: {
        ApiResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            data: { type: 'object' },
            meta: { type: 'object' },
            requestId: { type: 'string' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                details: { type: 'array', items: { type: 'object' } },
              },
            },
            requestId: { type: 'string' },
          },
        },
        PaginationMeta: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            limit: { type: 'integer' },
            total: { type: 'integer' },
            totalPages: { type: 'integer' },
            hasNext: { type: 'boolean' },
            hasPrev: { type: 'boolean' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Authentication and authorization' },
      { name: 'Users', description: 'User management' },
      { name: 'Patients', description: 'Patient registration and management' },
      { name: 'Staff', description: 'Staff management' },
      { name: 'Departments', description: 'Department management' },
      { name: 'Appointments', description: 'Appointment scheduling and workflow' },
      { name: 'Encounters', description: 'Clinical encounters' },
      { name: 'Diagnoses', description: 'Clinical diagnoses' },
      { name: 'Prescriptions', description: 'Prescription management' },
      { name: 'Laboratory', description: 'Laboratory test catalog' },
      { name: 'Lab Orders', description: 'Laboratory orders and results' },
      { name: 'Billing', description: 'Invoice management' },
      { name: 'Payments', description: 'Payment processing (sandbox)' },
      { name: 'Consents', description: 'Patient consent management' },
      { name: 'Audit', description: 'Audit log viewing' },
      { name: 'Notifications', description: 'User notifications' },
      { name: 'FHIR', description: 'FHIR R4 interoperability' },
    ],
  },
  apis: ['./src/modules/**/*.routes.ts'],
};

export function setupSwagger(app: Express): void {
  const specs = swaggerJsdoc(options);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'MediCore API Documentation',
  }));
  app.get('/api-docs.json', (_req, res) => {
    res.json(specs);
  });
}
