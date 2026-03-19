import cors from "cors";
import { config, normalizeOrigin } from "../config.js";

export function createCorsMiddleware() {
  return cors({
    origin: (origin, callback) => {
      const normalizedOrigin = normalizeOrigin(origin);
      if (!normalizedOrigin) return callback(null, true);
      if (!config.allowedOrigins.length || config.allowedOrigins.includes("*")) return callback(null, true);
      if (config.allowedOrigins.includes(normalizedOrigin)) return callback(null, true);
      return callback(new Error(`CORS bloqueado para origin: ${normalizedOrigin}`));
    },
  });
}
