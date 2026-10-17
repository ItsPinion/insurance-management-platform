/**
 * Demo dataset used by the manual QA / screenshot runs.
 *
 * The Day 2 schema already contains Policy / Claim / PremiumPayment /
 * Document tables, so the customer detail screen and the customer history
 * endpoint (FR-2.4) can be exercised end-to-end.
 */
export const DEMO_CUSTOMERS = [
  {
    name: 'Nita Rao',
    email: 'nita@insure.test',
    dob: new Date('1990-04-12'),
    phone: '9822001144',
    address: '14 Turner Road, Bengaluru',
    policies: [
      {
        policyNumber: 'HLT-2024-0001',
        policyType: 'HEALTH',
        premiumAmount: 18400,
        startDate: new Date('2024-01-15'),
        endDate: new Date('2027-01-14'),
        status: 'ACTIVE',
        claims: [
          {
            claimNumber: 'CLM-2025-0007',
            claimAmount: 12500,
            reason: 'Hospitalisation for dengue treatment',
            status: 'UNDER_REVIEW',
            submissionDate: new Date('2025-09-21'),
            reviewRemarks: 'Awaiting hospital discharge summary',
          },
        ],
        payments: [
          { amount: 18400, dueDate: new Date('2025-01-15'), paymentDate: new Date('2025-01-11'), paymentStatus: 'PAID' },
          { amount: 18400, dueDate: new Date('2026-01-15'), paymentDate: null, paymentStatus: 'PENDING' },
        ],
      },
      {
        policyNumber: 'VH-2023-0042',
        policyType: 'VEHICLE',
        premiumAmount: 24500,
        startDate: new Date('2023-06-01'),
        endDate: new Date('2025-05-31'),
        status: 'EXPIRED',
        claims: [
          {
            claimNumber: 'CLM-2024-0031',
            claimAmount: 34000,
            reason: 'Accidental bumper and headlight damage',
            status: 'APPROVED',
            submissionDate: new Date('2024-11-02'),
            reviewRemarks: 'Approved after third-party inspection',
            reviewedAt: new Date('2024-11-09'),
          },
        ],
        payments: [
          { amount: 24500, dueDate: new Date('2024-06-01'), paymentDate: new Date('2024-05-28'), paymentStatus: 'PAID' },
        ],
      },
    ],
    documents: [
      { fileName: 'aadhaar-card.pdf', filePath: 'uploads/seed/aadhaar-card.pdf', mimeType: 'application/pdf', sizeBytes: 182300, docType: 'IDENTITY' },
      { fileName: 'health-policy-2024.pdf', filePath: 'uploads/seed/health-policy-2024.pdf', mimeType: 'application/pdf', sizeBytes: 92410, docType: 'POLICY' },
    ],
  },
  {
    name: 'Rahul Singh',
    email: 'rahul@insure.test',
    dob: new Date('1985-11-02'),
    phone: '9771234114',
    address: '221 Bishop Street, Kolkata',
    policies: [
      {
        policyNumber: 'LIF-2025-0100',
        policyType: 'LIFE',
        premiumAmount: 42000,
        startDate: new Date('2025-02-01'),
        endDate: new Date('2030-01-31'),
        status: 'ACTIVE',
        claims: [],
        payments: [
          { amount: 42000, dueDate: new Date('2026-02-01'), paymentDate: null, paymentStatus: 'OVERDUE' },
        ],
      },
    ],
    documents: [
      { fileName: 'pan-card.pdf', filePath: 'uploads/seed/pan-card.pdf', mimeType: 'application/pdf', sizeBytes: 51200, docType: 'IDENTITY' },
    ],
  },
  {
    name: 'Meera Iyer',
    email: 'meera@insure.test',
    dob: new Date('1993-07-25'),
    phone: '9111111111',
    address: '9 Residency Road, Chennai',
    policies: [],
    documents: [],
  },
  {
    name: 'Ravi Deshmukh',
    email: 'ravi@insure.test',
    dob: new Date('1979-01-30'),
    phone: '9004506677',
    address: '58 FC Road, Pune',
    policies: [
      {
        policyNumber: 'HOM-2024-0203',
        policyType: 'HOME',
        premiumAmount: 31000,
        startDate: new Date('2024-04-01'),
        endDate: new Date('2029-03-31'),
        status: 'ACTIVE',
        claims: [],
        payments: [
          { amount: 31000, dueDate: new Date('2025-04-01'), paymentDate: new Date('2025-03-28'), paymentStatus: 'PAID' },
        ],
      },
    ],
    documents: [],
  },
];

export const BASE_USERS = [
  { name: 'System Admin', email: 'admin@insure.test', password: 'Admin@123', role: 'ADMIN' },
  { name: 'Agent Smith', email: 'agent@insure.test', password: 'Agent@123', role: 'AGENT' },
  { name: 'Asha Verma', email: 'asha@insure.test', password: 'Asha@1234', role: 'CUSTOMER' },
];
