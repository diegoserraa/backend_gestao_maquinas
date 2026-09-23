import {
    getMqttClient,
    isMqttConfigurado,
    MQTT_TOPIC,
} from "../config/mqtt";
import { TelemetriaService } from "../services/TelemetriaService";
import { broadcastTelemetria } from "../realtime/wsBus";
import { logger } from "../config/logger";

const log = logger.child({ modulo: "mqtt" });

/**
 * Assina o broker MQTT (HiveMQ Cloud) e transforma cada mensagem
 * `maquinas/<id>/telemetria` em uma leitura persistida + broadcast WS.
 *
 * Importado por efeito colateral em server.ts, igual aos jobs.
 */

const service = new TelemetriaService();

// aceita "maquinas/123/telemetria" com ou sem prefixo
// (ex.: "zdm-diego-8f2a/maquinas/123/telemetria")
const TOPICO_REGEX = /(?:^|\/)maquinas\/(\d+)\/telemetria$/;

// proteção contra payloads gigantes
const MAX_PAYLOAD_BYTES = 8 * 1024;

let ultimaMensagemEm: Date | null = null;
let conectado = false;

export function getMqttStatus() {
    return {
        configurado: isMqttConfigurado(),
        conectado,
        topico: MQTT_TOPIC,
        ultimaMensagemEm,
    };
}

function iniciar() {
    if (!isMqttConfigurado()) {
        log.warn("MQTT_URL não definido — ingestão de telemetria desativada");
        return;
    }

    const client = getMqttClient();

    if (!client) {
        return;
    }

    client.on("connect", () => {
        conectado = true;
        log.info("conectado ao broker");

        client.subscribe(MQTT_TOPIC, { qos: 1 }, (erro) => {
            if (erro) {
                log.error({ err: erro, topico: MQTT_TOPIC }, "falha ao assinar tópico");
            } else {
                log.info({ topico: MQTT_TOPIC }, "assinado no tópico");
            }
        });
    });

    client.on("reconnect", () => {
        log.warn("reconectando ao broker");
    });

    client.on("close", () => {
        conectado = false;
        log.warn("conexão com o broker encerrada");
    });

    client.on("error", (erro) => {
        log.error({ err: erro }, "erro na conexão MQTT");
    });

    client.on("message", async (topic, payload) => {
        ultimaMensagemEm = new Date();

        try {
            const match = topic.match(TOPICO_REGEX);

            if (!match) {
                return;
            }

            if (payload.length > MAX_PAYLOAD_BYTES) {
                log.warn({ topico: topic, bytes: payload.length }, "payload grande demais, ignorado");
                return;
            }

            const maquinaId = Number(match[1]);

            let dados: unknown;

            try {
                dados = JSON.parse(payload.toString("utf-8"));
            } catch {
                log.warn({ topico: topic }, "payload não é JSON válido");
                return;
            }

            const leitura = await service.registrarLeitura(maquinaId, dados);

            if (leitura) {
                broadcastTelemetria(leitura, leitura.empresa_id);
            }
        } catch (erro: any) {
            log.error({ err: erro, topico: topic }, "erro ao processar mensagem");
        }
    });
}

iniciar();
