const BLE_SERVICE_UUID = '0000180a-0000-1000-8000-00805f9b34fb'; // Device Information
const BLE_CHAR_UUID_SN = '00002a25-0000-1000-8000-00805f9b34fb'; // Serial Number String
const CUSTOM_SERVICE_UUID = '12345678-1234-1234-1234-123456789abc';
const CUSTOM_CHAR_UUID_SN = '87654321-4321-4321-4321-cba987654321';

const BleManager = {
  deviceSN: null,
  connected: false,

  setSN(sn) {
    this.deviceSN = sn;
    this.connected = true;
    window.dispatchEvent(new CustomEvent('sn-changed', { detail: sn }));
  },

  clearSN() {
    this.deviceSN = null;
    this.connected = false;
    window.dispatchEvent(new CustomEvent('sn-changed', { detail: null }));
  },

  async connect() {
    if (!navigator.bluetooth) {
      throw new Error('此浏览器不支持 Web Bluetooth API。请使用 Chrome 或 Edge。');
    }

    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [BLE_SERVICE_UUID] },
          { services: [CUSTOM_SERVICE_UUID] },
        ],
        optionalServices: [BLE_SERVICE_UUID, CUSTOM_SERVICE_UUID],
        acceptAllDevices: false,
      });

      const server = await device.gatt.connect();
      let sn = null;

      try {
        const service = await server.getPrimaryService(BLE_SERVICE_UUID);
        const char = await service.getCharacteristic(BLE_CHAR_UUID_SN);
        const value = await char.readValue();
        sn = new TextDecoder().decode(value);
      } catch {
        try {
          const service = await server.getPrimaryService(CUSTOM_SERVICE_UUID);
          const char = await service.getCharacteristic(CUSTOM_CHAR_UUID_SN);
          const value = await char.readValue();
          sn = new TextDecoder().decode(value);
        } catch {
          throw new Error('无法从设备读取 SN。请确认设备支持的 GATT 服务。');
        }
      }

      if (!sn || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$/.test(sn.trim())) {
        throw new Error(`无效的设备 SN: ${sn}`);
      }

      this.setSN(sn.trim());

      device.addEventListener('gattserverdisconnected', () => {
        this.clearSN();
      });

      return sn.trim();
    } catch (err) {
      if (err.message.includes('User cancelled')) {
        throw new Error('用户取消了蓝牙配对');
      }
      throw err;
    }
  },

  disconnect() {
    this.clearSN();
  },
};

window.BleManager = BleManager;
