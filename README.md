# CueSense iOS

Fondation SwiftUI pour l’application d’analyse du geste au snooker.

## État de V0.1

`BluetoothManager` recherche le capteur validé `WTeric…`, établit la connexion BLE et expose l’état de connexion, le RSSI et la batterie lorsqu’elle est publiée par le périphérique.

La découverte des services est encore volontairement générale : les UUID propriétaires du flux IMU doivent être relevés avec le capteur réel avant l’ajout de `SensorManager` et du décodage temps réel.
