import mqtt, { IClientOptions, MqttClient } from "mqtt";

/**
 * Cliente MQTT compartilhado.
 *
 * Toda a configuração vem do .env (nunca commitado):
 *
 *   MQTT_URL        ex: mqtts://xxxxx.s1.eu.hivemq.cloud:8883
 *   MQTT_USERNAME   usuário do broker
 *   MQTT_PASSWORD   senha do broker
 *   MQTT_TOPIC      tópico assinado (default: maquinas/+/telemetria)
 *   MQTT_CLIENT_ID  id do cliente (default: backend-maquinas-<pid>)
 *
 * Se MQTT_URL não estiver definido o backend continua subindo normalmente
 * (apenas sem ingestão de telemetria) — útil para rodar local sem broker.
 */

const MQTT_URL = process.env.MQTT_URL;

export const MQTT_TOPIC =
    process.env.MQTT_TOPIC || "maquinas/+/telemetria";

let client: MqttClient | null = null;

export function isMqttConfigurado(): boolean {
    return Boolean(MQTT_URL);
}

export function getMqttClient(): MqttClient | null {
    if (!MQTT_URL) {
        return null;
    }

    if (client) {
        return client;
    }

    const options: IClientOptions = {
        clientId:
            process.env.MQTT_CLIENT_ID ||
            `backend-maquinas-${process.pid}`,
        username: process.env.MQTT_USERNAME || undefined,
        password: process.env.MQTT_PASSWORD || undefined,
        reconnectPeriod: 5000,
        connectTimeout: 30_000,
        clean: true,
        // mqtts:// já ativa TLS. Mantém verificação de certificado.
        rejectUnauthorized: true,
    };

    client = mqtt.connect(MQTT_URL, options);

    return client;
}
