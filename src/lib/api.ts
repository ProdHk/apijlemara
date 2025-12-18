// src/lib/api.ts
import axios, { AxiosError, AxiosInstance } from "axios";
import Console, { ConsoleData } from "../lib/Console";

function stripSlashes(s = "") {
    return s.replace(/\/+$/, "");
}
function stripLeadingSlashes(s = "") {
    return s.replace(/^\/+/, "");
}

/**
 * Resolve a base URL da Cloud API da Meta
 * Ex: https://graph.facebook.com/v21.0
 */
export function getApiBase(): string {
    const base = stripSlashes(
        process.env.META_ENDPOINT_API || "https://graph.facebook.com"
    );

    const version = stripLeadingSlashes(
        process.env.CLOUD_API_VERSION || process.env.META_API_VERSION || "v21.0"
    );

    return `${base}/${version}`;
}

/**
 * Resolve o access token:
 * - Prioriza META_ACCESS_TOKEN
 * - Fallback para CLOUD_API_ACCESS_TOKEN
 */
export function getMetaAccessToken(): string {
    const token =
        process.env.META_ACCESS_TOKEN || process.env.CLOUD_API_ACCESS_TOKEN || "";

    if (!token) {
        throw new Error(
            "Token da Meta não definido. Configure META_ACCESS_TOKEN ou CLOUD_API_ACCESS_TOKEN no .env"
        );
    }

    return token;
}

/**
 * Cria instância do Axios configurada para Cloud API
 */
function createMetaApi(): AxiosInstance {
    const instance = axios.create({
        baseURL: getApiBase(),
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
        },
        timeout: 15000, // 15s de timeout pra não travar sua API
        validateStatus: (status) => status >= 200 && status < 300, // só 2xx é sucesso
    });

    // ----- Request: injeta Authorization sempre antes da chamada -----
    instance.interceptors.request.use((config) => {
        const token = getMetaAccessToken();
        config.headers = config.headers || {};
        (config.headers as any).Authorization = `Bearer ${token}`;

        // log leve opcional
        ConsoleData({
            type: "log",
            data: {
                metaRequest: {
                    method: config.method,
                    url: config.baseURL + config.url,
                },
            },
        });

        return config;
    });

    // ----- Response: log centralizado de erro -----
    instance.interceptors.response.use(
        (response) => response,
        (error: AxiosError<any>) => {
            const status = error.response?.status;
            const data = error.response?.data;

            Console({
                type: "error",
                message: `[MetaAPI] Erro na chamada (${status || "sem status"})`,
            });
            ConsoleData({
                type: "error",
                data: {
                    status,
                    url: error?.config?.baseURL + error.config?.url,
                    method: error.config?.method,
                    response: data,
                },
            });

            // Mantém o mesmo comportamento do Axios — apenas repassa o erro.
            return Promise.reject(error);
        }
    );

    return instance;
}

/**
 * Instância principal para uso em controllers (MetaController, etc.)
 * Uso:
 *   const { data } = await metaApi.post(`/${numberId}/messages`, payload);
 */
export const metaApi = createMetaApi();
