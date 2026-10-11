// Keep APP_NAME in sync with engine/config.py
export const APP_NAME = "Rally";
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
// public address of the board for the QR code; falls back to the address in the browser
export const BOARD_URL = process.env.NEXT_PUBLIC_BOARD_URL ?? "";
