import { db } from './index.ts';
import { testTypes, type ReferenceRangeConfig } from './schema.ts';

interface SeedTestType {
  slug: string;
  testName: string;
  category: 'blood' | 'physiological';
  portNumber: number | null;
  unit: string;
  secondaryUnit?: string | null;
  availabilityStatus:
    | 'available'
    | 'device_required'
    | 'coming_soon'
    | 'unavailable';
  sensingMethod: string;
  description: string;
  instructions: string[];
  referenceRangeConfig: ReferenceRangeConfig;
  accentColor: string;
}

export const DEFAULT_TEST_CATALOG: SeedTestType[] = [
  {
    slug: 'glucose',
    testName: 'Blood Glucose',
    category: 'blood',
    portNumber: 1,
    unit: 'mg/dL',
    availabilityStatus: 'device_required',
    sensingMethod: 'Electrochemical enzyme strip (Port 1)',
    description:
      'Capillary blood glucose analysis via Port 1 electrochemical biosensor channel.',
    instructions: [
      'Wash and thoroughly dry hands prior to capillary sampling.',
      'Insert a calibrated Glucose test strip firmly into Port 1 (Green).',
      'Apply a small capillary blood sample to the strip reaction tip.',
      'Remain still until the device confirms signal stabilization and transmits via BLE.',
    ],
    referenceRangeConfig: {
      minNormal: 70,
      maxNormal: 99,
      borderlineHigh: 125,
      criticalLow: 54,
      criticalHigh: 250,
      notes: 'Fasting adult reference range (70–99 mg/dL). Post-meal targets differ.',
    },
    accentColor: '#16A34A',
  },
  {
    slug: 'cholesterol',
    testName: 'Total Cholesterol',
    category: 'blood',
    portNumber: 2,
    unit: 'mg/dL',
    availabilityStatus: 'coming_soon',
    sensingMethod: 'Dry-chemistry reflectance photometry (Port 2)',
    description:
      'Total lipid cholesterol assay scheduled for Port 2 optical firmware calibration.',
    instructions: [
      'Hardware Port 2 photometric module is reserved for future chemistry validation.',
      'Manual laboratory value logging and simulator testing remain supported.',
    ],
    referenceRangeConfig: {
      minNormal: 120,
      maxNormal: 199,
      borderlineHigh: 239,
      criticalHigh: 300,
      notes: 'Desirable fasting total cholesterol < 200 mg/dL.',
    },
    accentColor: '#2563EB',
  },
  {
    slug: 'triglycerides',
    testName: 'Triglycerides',
    category: 'blood',
    portNumber: 3,
    unit: 'mg/dL',
    availabilityStatus: 'coming_soon',
    sensingMethod: 'Enzymatic colorimetric strip (Port 3)',
    description:
      'Fasting triglyceride assay assigned to Port 3 pending clinical reagent curve validation.',
    instructions: [
      'Hardware Port 3 optical curve validation is currently in progress.',
      'You may log validated laboratory readings or run simulator tests.',
    ],
    referenceRangeConfig: {
      minNormal: 40,
      maxNormal: 149,
      borderlineHigh: 199,
      criticalHigh: 500,
      notes: 'Normal fasting level < 150 mg/dL.',
    },
    accentColor: '#EA580C',
  },
  {
    slug: 'uric_acid',
    testName: 'Uric Acid',
    category: 'blood',
    portNumber: 4,
    unit: 'mg/dL',
    availabilityStatus: 'coming_soon',
    sensingMethod: 'Amperometric uricase strip (Port 4)',
    description:
      'Serum uric acid measurement channel assigned to Port 4 awaiting firmware validation.',
    instructions: [
      'Port 4 firmware calibration is pending clinical verification.',
      'Manual clinical lab entries and simulator testing are available.',
    ],
    referenceRangeConfig: {
      minNormal: 3.4,
      maxNormal: 7.0,
      borderlineHigh: 8.5,
      criticalHigh: 10.5,
      notes: 'Adult reference range 3.4–7.0 mg/dL (varies slightly by sex).',
    },
    accentColor: '#7C3AED',
  },
  {
    slug: 'hemoglobin',
    testName: 'Hemoglobin',
    category: 'blood',
    portNumber: 5,
    unit: 'g/dL',
    availabilityStatus: 'device_required',
    sensingMethod: 'Dual-wavelength optical microcuvette (Port 5)',
    description:
      'Whole-blood hemoglobin concentration measured through Port 5 optical absorption channel.',
    instructions: [
      'Insert an unused Hemoglobin micro-strip into Port 5 (Red).',
      'Draw the blood sample smoothly into the optical chamber without air bubbles.',
      'Keep the Hema Nexus unit flat on a stable surface during readout.',
    ],
    referenceRangeConfig: {
      minNormal: 12.0,
      maxNormal: 17.5,
      borderlineLow: 11.0,
      criticalLow: 8.0,
      criticalHigh: 20.0,
      notes: 'Adult reference range 12.0–17.5 g/dL.',
    },
    accentColor: '#DC2626',
  },
  {
    slug: 'total_protein',
    testName: 'Total Protein',
    category: 'blood',
    portNumber: 6,
    unit: 'g/dL',
    availabilityStatus: 'coming_soon',
    sensingMethod: 'Biuret colorimetric optical strip (Port 6)',
    description:
      'Serum total protein assay (albumin + globulin) assigned to optical chemistry validation.',
    instructions: [
      'Total Protein colorimetric strip calibration is pending firmware verification.',
      'Manual clinical entries and simulated testing are supported.',
    ],
    referenceRangeConfig: {
      minNormal: 6.0,
      maxNormal: 8.3,
      borderlineLow: 5.5,
      borderlineHigh: 8.9,
      criticalLow: 4.5,
      criticalHigh: 10.5,
      notes: 'Adult serum reference range 6.0–8.3 g/dL.',
    },
    accentColor: '#0F766E',
  },
  {
    slug: 'lactate',
    testName: 'Blood Lactate',
    category: 'blood',
    portNumber: 7,
    unit: 'mmol/L',
    availabilityStatus: 'coming_soon',
    sensingMethod: 'Lactate oxidase electrochemical channel',
    description:
      'Whole-blood lactate metabolic stress biomarker pending strip validation.',
    instructions: [
      'Blood Lactate enzymatic calibration is currently in development.',
      'Manual clinical entries and simulated testing are supported.',
    ],
    referenceRangeConfig: {
      minNormal: 0.5,
      maxNormal: 2.2,
      borderlineHigh: 3.9,
      criticalHigh: 4.0,
      notes: 'Resting venous/capillary lactate reference 0.5–2.2 mmol/L.',
    },
    accentColor: '#9333EA',
  },
  {
    slug: 'crp',
    testName: 'C-Reactive Protein (CRP)',
    category: 'blood',
    portNumber: 6,
    unit: 'mg/L',
    availabilityStatus: 'coming_soon',
    sensingMethod: 'Lateral-flow fluorescence immunoassay (Port 6)',
    description:
      'Systemic inflammation marker assay designed for Port 6 immunoassay cartridge.',
    instructions: [
      'Port 6 lateral-flow reader cartridge is scheduled for upcoming firmware release.',
      'Use manual entry to track laboratory CRP reports.',
    ],
    referenceRangeConfig: {
      minNormal: 0.0,
      maxNormal: 5.0,
      borderlineHigh: 10.0,
      criticalHigh: 50.0,
      notes: 'Standard reference < 5.0 mg/L.',
    },
    accentColor: '#0D9488',
  },
  {
    slug: 'temperature',
    testName: 'Body Temperature',
    category: 'physiological',
    portNumber: 7,
    unit: '°C',
    availabilityStatus: 'device_required',
    sensingMethod: 'Precision thermistor contact probe (Port 7)',
    description:
      'Continuous oral/axillary temperature sensing via wired clinical thermistor probe in Port 7.',
    instructions: [
      'Confirm the wired temperature probe is seated firmly in Port 7 (Amber).',
      'Apply a clean disposable probe sleeve before measurement.',
      'Place probe tip under the tongue or at the axillary site until thermal equilibrium settles.',
    ],
    referenceRangeConfig: {
      minNormal: 36.1,
      maxNormal: 37.2,
      borderlineHigh: 37.9,
      criticalLow: 35.0,
      criticalHigh: 39.5,
      notes: 'Normal resting adult temperature 36.1–37.2 °C.',
    },
    accentColor: '#D97706',
  },
  {
    slug: 'creatinine',
    testName: 'Creatinine',
    category: 'blood',
    portNumber: 8,
    unit: 'mg/dL',
    availabilityStatus: 'coming_soon',
    sensingMethod: 'Enzymatic biosensor strip (Port 8)',
    description:
      'Renal filtration biomarker channel assigned to Port 8 pending reagent validation.',
    instructions: [
      'Port 8 renal chemistry module is awaiting multi-lot validation.',
      'Manual laboratory creatinine entries and simulator testing are supported.',
    ],
    referenceRangeConfig: {
      minNormal: 0.6,
      maxNormal: 1.3,
      borderlineHigh: 1.6,
      criticalHigh: 4.0,
      notes: 'Adult serum reference 0.6–1.3 mg/dL.',
    },
    accentColor: '#475569',
  },
  {
    slug: 'urea',
    testName: 'Blood Urea',
    category: 'blood',
    portNumber: 9,
    unit: 'mg/dL',
    availabilityStatus: 'coming_soon',
    sensingMethod: 'Urease conductivity strip (Port 9)',
    description:
      'Blood urea nitrogen / urea estimation channel assigned to Port 9.',
    instructions: [
      'Port 9 reagent calibration is currently under development.',
      'Manual clinical lab entries and simulator testing are available.',
    ],
    referenceRangeConfig: {
      minNormal: 15,
      maxNormal: 40,
      borderlineHigh: 50,
      criticalHigh: 80,
      notes: 'Standard adult urea reference 15–40 mg/dL.',
    },
    accentColor: '#78350F',
  },
  {
    slug: 'blood_pressure',
    testName: 'Blood Pressure',
    category: 'physiological',
    portNumber: null,
    unit: 'mmHg',
    secondaryUnit: 'mmHg',
    availabilityStatus: 'device_required',
    sensingMethod: 'Oscillometric upper-arm cuff module',
    description:
      'Automated systolic and diastolic arterial pressure measurement via the integrated upper-arm cuff.',
    instructions: [
      'Rest quietly seated for 5 minutes with back supported and feet flat.',
      'Wrap the upper-arm cuff snugly 2 cm above the elbow crease at heart level.',
      'Avoid speaking or moving while the cuff inflates and deflates.',
    ],
    referenceRangeConfig: {
      minNormal: 90,
      maxNormal: 120,
      borderlineHigh: 139,
      criticalLow: 80,
      criticalHigh: 180,
      secondaryMinNormal: 60,
      secondaryMaxNormal: 80,
      secondaryLabel: 'Diastolic',
      notes: 'Normal resting BP < 120/80 mmHg.',
    },
    accentColor: '#1E3A8A',
  },
  {
    slug: 'spo2',
    testName: 'SpO2 Oxygen Saturation',
    category: 'physiological',
    portNumber: null,
    unit: '%',
    secondaryUnit: 'BPM',
    availabilityStatus: 'device_required',
    sensingMethod: 'Dual-LED optical pulse oximeter bay',
    description:
      'Non-invasive peripheral oxygen saturation and pulse waveform capture via integrated finger optical bay.',
    instructions: [
      'Warm hands briefly if fingers feel cold to improve peripheral perfusion.',
      'Place your index finger completely inside the integrated SpO2 optical bay.',
      'Keep your hand resting steadily for 15–20 seconds while the PPG waveform stabilizes.',
    ],
    referenceRangeConfig: {
      minNormal: 95,
      maxNormal: 100,
      borderlineLow: 92,
      criticalLow: 88,
      secondaryMinNormal: 60,
      secondaryMaxNormal: 100,
      secondaryLabel: 'Pulse',
      notes: 'Normal resting SpO2 is 95–100%.',
    },
    accentColor: '#0284C7',
  },
  {
    slug: 'heart_rate',
    testName: 'Heart Rate',
    category: 'physiological',
    portNumber: null,
    unit: 'BPM',
    availabilityStatus: 'device_required',
    sensingMethod: 'Optical PPG & oscillometric pulse capture',
    description:
      'Resting pulse rate derived from the integrated SpO2 optical sensor or blood pressure cuff.',
    instructions: [
      'Sit calmly for at least 2 minutes before initiating capture.',
      'Place index finger in the optical sensor bay or use the upper-arm cuff.',
    ],
    referenceRangeConfig: {
      minNormal: 60,
      maxNormal: 100,
      borderlineLow: 50,
      borderlineHigh: 110,
      criticalLow: 40,
      criticalHigh: 140,
      notes: 'Normal adult resting heart rate 60–100 BPM.',
    },
    accentColor: '#E53945',
  },
  {
    slug: 'ecg',
    testName: 'Single-Lead ECG',
    category: 'physiological',
    portNumber: null,
    unit: 'BPM',
    availabilityStatus: 'coming_soon',
    sensingMethod: 'Biopotential analog front-end (AFE validation)',
    description:
      'Single-lead cardiac rhythm trace scheduled after hardware AFE noise certification.',
    instructions: [
      'Single-lead ECG signal acquisition is undergoing regulatory hardware validation.',
      'Not yet enabled for live clinical capture.',
    ],
    referenceRangeConfig: {
      minNormal: 60,
      maxNormal: 100,
      notes: 'Resting sinus rhythm reference 60–100 BPM.',
    },
    accentColor: '#B45309',
  },
];

let seedPromise: Promise<void> | null = null;

export async function ensureTestCatalogSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      try {
        await db
          .insert(testTypes)
          .values(DEFAULT_TEST_CATALOG)
          .onConflictDoNothing({ target: testTypes.slug });
      } catch (error) {
        seedPromise = null;
        console.error('Error seeding test catalog:', error);
        throw new Error('Failed to load test catalog.', { cause: error });
      }
    })();
  }
  return seedPromise;
}
