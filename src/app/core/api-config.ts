/**
 * Base URL of the shared yydev backend. Used for tools that offload heavy work
 * to the server (e.g. Base64-encoding files larger than the browser threshold).
 * Change this per environment when the API is deployed.
 */
export const API_BASE_URL = 'https://localhost:7241';

/** Files at or below this size are encoded in the browser; larger ones go to the API. */
export const CLIENT_ENCODE_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

/** Largest file the API will accept for server-side encoding. Mirrors the backend cap. */
export const SERVER_ENCODE_MAX_BYTES = 50 * 1024 * 1024; // 50 MB
