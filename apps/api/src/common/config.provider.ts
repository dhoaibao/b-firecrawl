import { loadConfig, type ApiConfig } from "./config";

export const API_CONFIG = "API_CONFIG";
export const apiConfigProvider = {
  provide: API_CONFIG,
  useFactory: (): ApiConfig => loadConfig(),
};
