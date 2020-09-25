import Paho from 'paho-mqtt';

/**
 * @see - https://www.eclipse.org/paho/index.php?page=clients/js/index.php#
 * @see - https://www.eclipse.org/paho/files/jsdoc/index.html
 */

export default {
  Paho,
  register () {
    if (window.Paho) {
      return;
    }

    // Even though the export of paho-mqtt is { Client, Message }, there is an
    // internal reference that the library makes to itself, and it expects
    // itself to exist at Paho.MQTT.
    window.Paho = {
      MQTT: Paho,
    };
  },
};
