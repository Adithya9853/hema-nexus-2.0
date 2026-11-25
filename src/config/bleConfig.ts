export interface BleGattConfiguration {
  deviceNamePrefix: string;
  customServiceUuid: string;
  measurementCharacteristicUuid: string;
  controlCharacteristicUuid: string;
}

// Standard Bluetooth SIG 16-bit assigned service UUIDs (public specification)
export const STANDARD_BLE_SERVICES = {
  deviceInformation: 0x180a,
  batteryService: 0x180f,
  bloodPressure: 0x1810,
  glucose: 0x1808,
  pulseOximeter: 0x1822,
  healthThermometer: 0x1809,
  heartRate: 0x180d,
} as const;

export const STANDARD_BLE_CHARACTERISTICS = {
  firmwareRevision: 0x2a26,
  hardwareRevision: 0x2a27,
  serialNumber: 0x2a25,
  batteryLevel: 0x2a19,
  bloodPressureMeasurement: 0x2a35,
  glucoseMeasurement: 0x2a18,
  plxSpotCheckMeasurement: 0x2a5e,
  temperatureMeasurement: 0x2a1c,
  heartRateMeasurement: 0x2a37,
} as const;

// Custom ESP32 GATT UUIDs are intentionally NOT fabricated.
// Supply via VITE_HEMA_BLE_* env variables or enter your firmware's UUID in Device Settings.
export function getInitialBleConfig(): BleGattConfiguration {
  return {
    deviceNamePrefix: 'Hema',
    customServiceUuid:
      (import.meta.env.VITE_HEMA_BLE_SERVICE_UUID as string | undefined) || '',
    measurementCharacteristicUuid:
      (import.meta.env.VITE_HEMA_BLE_MEASUREMENT_CHAR_UUID as
        | string
        | undefined) || '',
    controlCharacteristicUuid:
      (import.meta.env.VITE_HEMA_BLE_CONTROL_CHAR_UUID as string | undefined) ||
      '',
  };
}
